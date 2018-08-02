'use strict'

const fwAddr = require('forward-addr')
const wrapper = require('./wrapper')
const pull = require('pull-stream')

function default404 (conn, connState) {
  pull(pull.values([]), conn, pull.abort(true))
}

module.exports = async function sortingHat (conn, {timeout, protocols, handlers, on404}) {
  if (!on404) { on404 = default404 }

  let connState = []
  let found = false

  while (true) {
    const wrapped = wrapper({conn, timeout: timeout || 2000})
    let result = await Promise.all(protocols.map(async (proto) => {
      try {
        let res = await proto.detect(wrapped.createReader()) // TODO: evaluate if reader needs cleanup (abort src) or if gc does everything?
        if (!res) return res
        if (!res.state) return [proto.name, res]
        return [proto.name, res.props, res.state] // this is for more complex protos that need to pass a state to .stream() or subprotos
      } catch (e) {
        return false
      }
    }))

    result = result.filter(Boolean)
    if (result.length > 1) throw new Error('Multiple protocols found: ' + result.map(p => p[0]).join('&'))
    connState.push(result)
    conn = wrapper.restore()

    handlers = handlers.filter(({address}) => fwAddr.match(address, connState))
    let handler = handlers[0]

    if (!handler) {
      break
    }

    let matchLvl = fwAddr.match(handler.address, connState)

    let currentPart = handler.address[connState.length - 1]
    let proto = protocols.filter(proto => currentPart.protocol === proto.name)[0]

    if (proto.children) {
      protocols = proto.children // ex: tcp -> [ssl, http, ssh, ...]
    }

    if (matchLvl === 2) {
      let connRes
      switch (currentPart.action) {
        case 'stream': {
          connRes = await proto.stream(conn, result[2])
          break
        }
        case 'forward': {
          connRes = conn
          break
        }
        case 'sub': {
          // TODO: subproto support
          break
        }
        default: throw new TypeError(currentPart.action)
      }
      found = handler
      handler.handle(connRes, connState)
      break
    } else if (matchLvl === 1) { // means we need to do stream first, but stream is NOT the end action
      switch (currentPart.action) {
        case 'stream': {
          conn = await proto.stream(conn, result[2])
          break
        }
        case 'sub': {
          // TODO: subproto support
          break
        }
        default: throw new TypeError(currentPart.action)
      }
    }
  }

  if (!found) return on404(wrapper.restore(), connState)

  return {connState, found}
}
