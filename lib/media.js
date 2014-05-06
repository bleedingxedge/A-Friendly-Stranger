/*jshint camelcase:false */
var _         = require('underscore')
var config    = require('../config')
var instagram = require('instagram-node')
var Promise   = require('bluebird')
var tumblr    = require('tumblr.js')
var Twit      = require('twit')
var redis     = require('redis')
var url = require('url')

var twitterClient = new Twit({
  consumer_key: process.env.TW_CONSUMER_KEY,
  consumer_secret: process.env.TW_CONSUMER_SECRET,
  access_token: process.env.TW_ACCESS_TOKEN,
  access_token_secret: process.env.TW_TOKEN_SECRET
})
Promise.promisifyAll(twitterClient)

var instagramClient = instagram.instagram()
instagramClient.use({
  client_id: process.env.IG_CLIENT,
  client_secret: process.env.IG_SECRET
})
Promise.promisifyAll(instagramClient)

var tumblrClient = new tumblr.Client({
  consumer_key: process.env.TUMBLR_CONSUMER
})
Promise.promisifyAll(tumblrClient)

var redisClient
if (process.env.REDISCLOUD_URL) {
  var redisURL = url.parse(process.env.REDISCLOUD_URL)
  redisClient = redis.createClient(redisURL.port, redisURL.hostname,
    {no_ready_check: true})
  redisClient.auth(redisURL.auth.split(':')[1]);
} else {
  redisClient = redis.createClient()
}
Promise.promisifyAll(redisClient)

var sources = {
  twitter: 'twitter',
  instagram: 'instagram',
  tumblr: 'tumblr'
}

function cacheData(keyPrefix, items) {
  return Promise.all(_.map(items, function (item) {
    var key

    redisClient.hincrbyAsync('control', keyPrefix + ':nextId', 1)
    .then(function (_nextId) {
      key = keyPrefix + ':' + _nextId
      return redisClient.hmsetAsync(key, item)

    }).then(function () {
      return redisClient.zaddAsync('items', item.createdAt.getTime(), key)
    })

  })).then(function() {
    return items
  })
}

function findTweets() {
  return redisClient.hgetAsync('control', 'twitter:max_id')
  .then(function(max_id) {
    var query = {q: '#' + config.searchTerm}
    if (max_id) {
      query.since_id = max_id
    }
    return twitterClient.getAsync('search/tweets', query)
  }).then(function (res) {
    // res -> [data, response]
    var metadata = res[0].search_metadata
    return redisClient.hsetAsync('control', 'twitter:max_id', metadata.max_id)
    .then(function() {
      return res[0] && res[0].statuses
    })
  }).then(function processTweets(tweets) {
    return _.map(tweets, function(item) {
      return {
        source: sources.twitter,
        id: item.id,
        url: 'https://twitter.com/' + item.user.screen_name +
        '/status/' + item.id_str,
        caption: item.text,
        photo: item.entities.media && item.entities.media[0].media_url_https,
        user: item.user.screen_name,
        faves: item.favorite_count,
        retweets: item.retweet_count,
        createdAt: new Date(item.created_at)
      }
    })
  }).then(function (items) {
    return cacheData('twitter', items)
  })
}

function findInstagram() {
  return instagramClient.tag_media_recentAsync(config.searchTerm)
  .then(function (res) {
    // res -> [medias, pagination, limit]
    return res[0]
  }).then(function processMedias(medias) {
    return _.map(medias, function (item) {
      return {
        source: sources.instagram,
        id: item.id,
        url: item.link,
        caption: item.caption && item.caption.text,
        photo: item.images.standard_resolution.url,
        user: item.user.username,
        faves: item.likes.count,
        createdAt: new Date(parseInt(item.created_time, 10) * 1000)
      }
    })
  })
}

function findTumblr() {
  return tumblrClient.taggedAsync(config.searchTerm)
  .then(function processTumblr(posts) {
    return _.map(posts, function (item) {
      return {
        source: sources.tumblr,
        id: item.id,
        url: item.post_url,
        photo: item.image_permalink,
        user: item.blog_name,
        caption: item.caption,
        createdAt: new Date(item.timestamp * 1000)
      }
    })
  })
}

function media() {
  return Promise.all([findTweets(), findInstagram(), findTumblr()])
  .spread(function (twitterData, instagramData, tumblrData) {
    return {
      twitter: twitterData,
      instagram: instagramData,
      tumblr: tumblrData,
    }
  })
}

module.exports = media