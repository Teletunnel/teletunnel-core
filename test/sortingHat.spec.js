'use strict'

/* eslint-env mocha */

const {sortingHat} = require('../')
const protocols = require('teletunnel-protocols')()
const {fakeConn} = require('./utils')
const {parse, validate} = require('forward-addr')
const assert = require('assert')

describe('sortingHat', () => {
  it('should find and match SSH', async () => {
    const conn = fakeConn('SSH-2.0-OpenSSH_7.2p2 Ubuntu-4ubuntu2.4\r\n')
    const addr = validate(parse('/tcp/.port/5233/ssh/'), protocols)
    const handlers = [{
      address: addr,
      handle: () => {}
    }]
    const res = await sortingHat(conn, {protocols, handlers})
    assert.deepStrictEqual(res, {
      connState: [
        [ 'tcp', { port: '5233' } ],
        [ 'ssh', { version: 'SSH-2.0-OpenSSH_7.2p2 Ubuntu-4ubuntu2.4' } ]
      ],
      found: handlers[0]
    })
  })
})
