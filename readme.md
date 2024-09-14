# gtfs-rt-differential-to-full-dataset

**Transform a continuous [GTFS Realtime (GTFS-RT)](https://developers.google.com/transit/gtfs-realtime/) stream of [`DIFFERENTIAL` incrementality](https://gtfs.org/documentation/realtime/reference/#enum-incrementality) data into a [`FULL_DATASET`](https://gtfs.org/documentation/realtime/reference/#enum-incrementality) dump.**

*Note:* Right now, this package *does not* obey the [draft `DIFFERENTIAL` spec](https://github.com/google/transit/issues/84) exactly. See below and [#1](https://github.com/derhuerst/gtfs-rt-differential-to-full-dataset/issues/1) for details.

[![npm version](https://img.shields.io/npm/v/gtfs-rt-differential-to-full-dataset.svg)](https://www.npmjs.com/package/gtfs-rt-differential-to-full-dataset)
[![build status](https://img.shields.io/travis/derhuerst/gtfs-rt-differential-to-full-dataset.svg)](https://travis-ci.org/derhuerst/gtfs-rt-differential-to-full-dataset)
![ISC-licensed](https://img.shields.io/github/license/derhuerst/gtfs-rt-differential-to-full-dataset.svg)
[![support me via GitHub Sponsors](https://img.shields.io/badge/support%20me-donate-fa7664.svg)](https://github.com/sponsors/derhuerst)
[![chat with me on Twitter](https://img.shields.io/badge/chat%20with%20me-on%20Twitter-1da1f2.svg)](https://twitter.com/derhuerst)


## Installing

```shell
npm install gtfs-rt-differential-to-full-dataset
```


## Usage

```js
const toFullDataset = require('gtfs-rt-differential-to-full-dataset')

const toFull = toFullDataset({
	ttl: 2 * 60 * 1000, // 2 minutes
})
toFull.on('error')

differentialFeedEntities.pipe(toFull)
setInterval(() => {
	console.log(toFull.asFeedMessage())
}, 5000)
```

`toFull` will be a [writable stream](https://nodejs.org/api/stream.html#stream_class_stream_writable) in [object mode](https://nodejs.org/api/stream.html#stream_object_mode) that expects JS objects in the [`FeedEntity`](https://gtfs.org/documentation/realtime/reference/#message-feedentity) structure/format.

`toFull.asFeedMessage()` returns a [protocol-buffer-encoded](https://protobuf.dev) [`FeedMessage`](https://gtfs.org/documentation/realtime/reference/#message-feedmessage) with all relevant `FeedEntity`s that have been written into `toFull` so far.

`toFull.nrOfEntities()` returns the number of `FeedEntity`s that are currently part of the `FeedMessage`.


## Contributing

If you have a question or have difficulties using `gtfs-rt-differential-to-full-dataset`, please double-check your code and setup first. If you think you have found a bug or want to propose a feature, refer to [the issues page](https://github.com/derhuerst/gtfs-rt-differential-to-full-dataset/issues).
