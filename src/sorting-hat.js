'use strict'

const debug = require('debug')
const log = debug('teletunnel:core:sorting-hat')

const fwAddr = require('forward-addr')
const wrapper = require('./wrapper')
const pull = require('pull-stream')
const Connection = require('interface-connection').Connection

function default404 (conn, connState) {
  pull(pull.values([]), conn, pull.drain())
}

// TODO: fix "functions in loop"

module.exports = async function sortingHat (conn, {timeout, protocols, handlers, on404}) {
  if (!on404) { on404 = default404 }

  let connState = []
  let found = false

  while (true) {
    log('try detect, state=%s, protos=%s', connState.length, protocols.map(p => p.name).join(';'))

    const wrapped = wrapper({conn, timeout: timeout || 2000})

    // TODO: add support for protos without .detect() possibly using .directDetect and filtering them here (if one is found skip detect and assume this proto, then .stream() it)
    // TODO: possibly add properties .stream() can detect, too?

    let result = await Promise.all(protocols.map(async (proto) => {
      try {
        let res = await proto.detect(wrapped.createReader()) // TODO: evaluate if reader needs cleanup (abort src) or if gc does everything?
        if (!res) return res
        if (!res.state) return [proto.name, res]
        return [proto.name, res.props, res.state] // this is for more complex protos that need to pass a state to .stream() or subprotos
      } catch (e) {
        log(e)
        return false
      }
    }))

    result = result.filter(Boolean)
    if (result.length > 1) throw new Error('Multiple protocols found: ' + result.map(p => p[0]).join('&'))
    result = result[0]
    connState.push(result)
    conn = new Connection(wrapped.restore(), conn)

    if (!result) { // if we didn't get a result here we are in an undefined state basically. best is to do 404
      log('detect did not detect any proto')
      break
    }

    log('detected %o', result)

    handlers = handlers.filter(({address}) => fwAddr.match(address, connState))
    let handler = handlers[0]

    if (!handler) {
      log('no handlers for detected proto')
      break
    }

    let matchLvl = fwAddr.match(handler.address, connState)

    let currentPart = handler.address[connState.length - 1]
    let proto = protocols.filter(proto => currentPart.protocol === proto.name)[0]

    if (proto.children) {
      protocols = proto.children // ex: tcp -> [ssl, http, ssh, ...]
    }

    log('continue with handler for %s %s', proto.name, matchLvl)

    if (matchLvl === 2) {
      let connRes
      switch (currentPart.action) {
        case 'stream': {
          connRes = new Connection(await proto.stream(conn, result[2]), conn)
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
      log('finish')
      break
    } else if (matchLvl === 1) { // means we need to do stream first, but stream is NOT the end action
      switch (currentPart.action) {
        case 'stream': {
          conn = new Connection(await proto.stream(conn, result[2]), conn)
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

  if (!found) {
    log('404')
    on404(conn, connState)
  }

  return {connState, found}
}
