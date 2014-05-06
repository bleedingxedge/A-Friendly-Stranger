/*jshint camelcase:false */
var _         = require('underscore')
var config    = require('../config')
var Promise   = require('bluebird')
var Twit      = require('twit')
var redis     = require('redis')
var url       = require('url')
var request   = Promise.promisify(require('request'))

var twitterClient = new Twit({
  consumer_key: process.env.TW_CONSUMER_KEY,
  consumer_secret: process.env.TW_CONSUMER_SECRET,
  access_token: process.env.TW_ACCESS_TOKEN,
  access_token_secret: process.env.TW_TOKEN_SECRET
})
Promise.promisifyAll(twitterClient)

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
    var key = keyPrefix + ':' + item.id

    return redisClient.existsAsync(key).then(function (exists) {
      if(! exists) {
        return redisClient.hmsetAsync(key, item)
        .then(function () {
          return redisClient.zaddAsync('items', item.createdAt, key)
        })
      }
      return true
    })

  })).then(function() {
    return items
  })
}

function setLastId(service, lastId) {
  return redisClient.hsetAsync('control', service+':lastId', lastId)
}

function findTweets() {
  return redisClient.hgetAsync('control', 'twitter:lastId')
  .then(function requestData(lastId) {
    var query = {q: '#' + config.searchTerm}
    if (lastId) {
      query.since_id = lastId
    }
    return twitterClient.getAsync('search/tweets', query)
  }).then(function (res) {
    // res -> [data, response]
    return setLastId('twitter', res[0].search_metadata.max_id).then(function() {
      return res[0].statuses
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
        createdAt: new Date(item.created_at).getTime()
      }
    })
  }).then(function (items) {
    return cacheData('twitter', items)
  })
}

function findInstagram() {
  return redisClient.hgetAsync('control', 'instagram:lastId')
  .then(function requestData(lastId) {
    var url = 'https://api.instagram.com/v1/tags/'+ config.searchTerm +
    '/media/recent?client_id=:clientId&client_secret=:clientSecret'
    .replace(':clientId', process.env.IG_CLIENT)
    .replace(':clientSecret', process.env.IG_SECRET)
    if (lastId) {
      url = url + '&min_id=' + lastId
    }
    return request(url).spread(function(response, body) {
      return JSON.parse(body)
    })
  }).then(function (body) {
    return setLastId('instagram', body.pagination.min_tag_id).then(function () {
      return body.data
    })
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
        createdAt: new Date(parseInt(item.created_time, 10) * 1000).getTime()
      }
    })
  }).then(function (items) {
    return cacheData('instagram', items)
  })
}

function findTumblr() {
  return redisClient.hgetAsync('control', 'tumblr:lastId')
  .then(function requestData(lastId) {

    var url = 'http://api.tumblr.com/v2/tagged?tag=:tag&api_key=:apiKey'
    .replace(':tag', config.searchTerm)
    .replace(':apiKey', process.env.TUMBLR_CONSUMER)
    if (lastId) {
      url = url + '&before=' + lastId
    }

    return request(url).spread(function (response, body) {
      return JSON.parse(body)
    })
  }).then(function (posts) {
    return setLastId('tumblr', Date.now()).then(function() {
      return posts
    })
  })
  .then(function processTumblr(posts) {
    return _.map(posts, function (item) {
      return {
        source: sources.tumblr,
        id: item.id,
        url: item.post_url,
        photo: item.image_permalink,
        user: item.blog_name,
        caption: item.caption,
        createdAt: new Date(item.timestamp * 1000).getTime()
      }
    })
  }).then(function (items) {
    return cacheData('tumblr', items)
  })
}

function update() {
  return Promise.all([findTweets(), findInstagram(), findTumblr()])
  .then(function () {
    return redisClient.hsetAsync('control', 'lastRefresh', Date.now())
  })
}

function media() {
  return redisClient.hgetAsync('control', 'lastRefresh')
  .then(function(lastRefresh) {
    if (lastRefresh) {
      if (+lastRefresh + config.refresh < Date.now()) {
        return update()
      } else {
        return true
      }
    }
    return update()
  }).then(function () {
    //kill outdated items
    return redisClient.zrevrangeAsync('items', config.items, -1)
    .then(function (keys) {
      return Promise.all(_.map(keys, function (key) {
        return redisClient.del(key)
      }))
    }).then(function () {
      return redisClient.zremrangebyrankAsync('items', 0, (-config.items) -1)
    })
  }).then(function() {
    return redisClient.zrevrangeAsync('items', 0, -1)
  }).then(function (keys) {
    return Promise.all(_.map(keys, function(key) {
      return redisClient.hgetallAsync(key)
    }))
  })
}

module.exports = media