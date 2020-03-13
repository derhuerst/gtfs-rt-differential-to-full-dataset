'use strict'

const pump = require('pump')
const ndjson = require('ndjson')
const differentialToFullDataset = require('.')

const toFullDataset = differentialToFullDataset({
	ttl: 2 * 60 * 1000, // 2 minutes
})

pump(
	process.stdin,
	ndjson.parse(),
	toFullDataset,
	(err) => {
		if (err) {
			console.error(err)
			process.exit(1)
		} else {
			process.stdout.write(toFullDataset.asFeedMessage())
		}
	}
)
