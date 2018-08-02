'use strict'

const Cache = require('pull-cache')
const Reader = require('pull-reader')
const pull = require('pull-stream')
const Connection = require('interface-connection')

module.exports = ({timeout, conn}) => {
  let cache = Cache(conn.source)

  return {
    createReader: () => {
      let reader = Reader(timeout)
      pull(
        cache(),
        reader
      )

      return {
        read: (bytes) => new Promise((resolve, reject) => {
          reader.read(bytes, (err, res) => err ? reject(err) : resolve(res))
        }),
        getObservedAddrs: conn.getObservedAddrs.bind(conn)
      }
    },
    restore: () => {
      let src = cache()
      return new Connection({
        source: (end, cb) => {
          if (end) return cache(end, cb)
          else return src(end, cb)
        },
        sink: conn.sink
      }, conn)
    }
  }
}
