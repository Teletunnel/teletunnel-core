'use strict'

const fwAddr = require('forward-addr')

async function processConn (conn, connState, protocols, handlers, on404Handler) {
  let result = await Promise.all(protocols.map(async (proto) => {
    try {
      let res = await proto.detect(conn)
      if (!res) return res
      return [proto.name, res.props, res.state]
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
