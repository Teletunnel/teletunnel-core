'use strict'

const fwAddr = require('forward-addr')
const wrapper = require('./wrapper')

async function processConn (conn, {timeout, protocols, handlers, on404}, connState) {
  if (!connState) connState = []

  const wrapped = wrapper({conn, timeout: timeout || 2000})
  let result = await Promise.all(protocols.map(async (proto) => {
    try {
      let res = await proto.detect(wrapped.createReader()) // TODO: evaluate if reader needs cleanup (abort src) or if gc does everything?
      if (!res) return res
      if (!res.props) return [proto.name, res]
      return [proto.name, res.props, res.state] // this is for more complex protos that need to pass a state to .stream() or subprotos
    } catch (e) {
      return false
    }
  }))
  result = result.filter(Boolean)
  if (result.length > 1) throw new Error('Multiple protocols found: ' + result.map(p => p[0]).join('&'))
  if (!result.length) return on404Handler(conn, connState)
  connState.push(result)
  handlers = handlers.filter(({address}) => fwAddr.match(address, connState))
  let applicableHandlers = handlers // TODO: add matcher for that
}
