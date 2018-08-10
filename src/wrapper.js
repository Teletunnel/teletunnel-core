'use strict'

const Reader = require('pull-reader')
const pull = require('pull-stream')
const Connection = require('interface-connection').Connection

function Cache (read) {
  let restored = false
  const proms = []

  const nextProm = () => { // generate a promise that resolves with the next read result
    if (restored) return Promise.resolve([new Error('Cached stream has been restored!')])
    const prom = new Promise((resolve, reject) => read(null, (...a) => resolve(a)))
    proms.push(prom)
    return prom
  }

  let fnc = () => {
    let i = 0

    return (end, cb) => { // await the next cached promise
      if (end) { // cached stream shouldn't end source, do as if
        return cb(true) // eslint-disable-line standard/no-callback-literal
      }

      let prom = proms[i++] || nextProm()
      prom.then((a) => cb(...a)) // eslint-disable-line standard/no-callback-literal
    }
  }

  fnc.restore = () => { // restore the stream
    restored = true
    let d = false
    let i = 0

    return (end, cb) => {
      if (d) {
        return read(end, cb)
      } else {
        if (end) { // if we have end, forward
          d = true
          return read(end, cb)
        }

        let prom = proms[i++]
        if (!prom) { // if there is no promise anymore, continue as usual
          d = true
          return read(end, cb)
        }
        prom.then((a) => cb(...a)) // eslint-disable-line standard/no-callback-literal
      }
    }
  }

  return fnc
}

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
        getAddrs: () => new Promise((resolve, reject) => {
          conn.getObservedAddrs((err, res) => err ? reject(err) : resolve(res))
        })
      }
    },
    restore: () => {
      let src = cache.restore()
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
