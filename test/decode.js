#!/usr/bin/env node
'use strict'

const {FeedMessage} = require('gtfs-rt-bindings')
const {inspect} = require('util')
const {isatty} = require('tty')

const buf = Buffer.from(process.argv[2], 'hex')
const msg = FeedMessage.toObject(FeedMessage.decode(buf))

console.log(inspect(msg, {
	depth: null,
	colors: isatty(process.stdout.fd),
}))
