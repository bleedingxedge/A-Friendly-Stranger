/*jshint camelcase:false */
var _         = require('underscore')
var config    = require('../config')
var Promise   = require('bluebird')
var redis     = require('redis')
var url       = require('url')
var request   = Promise.promisify(require('request'))

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

function requestBearer() {
  return redisClient.hgetAsync('control', 'twitter:bearer')
  .then(function requestBearer(bearer) {
    if (bearer) {
      return bearer
    }
    return request({
      url: 'https://api.twitter.com/oauth2/token',
      method: 'POST',
      form: { grant_type: 'client_credentials' },
      auth: {
        user: process.env.TW_CONSUMER_KEY,
        pass: process.env.TW_CONSUMER_SECRET,
        sendImmediately: true
      }
    }).spread(function (response, body) {
      var data = JSON.parse(body)
      if (response.statusCode !== 200) {
        throw new Error('No auth')
      }
      if (! (data.token_type && data.access_token)) {
        throw new Error('No auth')
      }
      return redisClient.hsetAsync(
        'control', 'twitter:bearer', data.access_token
      ).then(function () {
        return data.access_token
      })
    })
  })
}

function findTweets() {
  requestBearer().then(function requestData(bearer) {
    return redisClient.hgetAsync('control', 'twitter:lastId')
    .then(function (lastId) {
      var opts = {
        url: 'https://api.twitter.com/1.1/search/tweets.json',
        qs: { q: '#' + config.searchTerm },
        headers: {
          authorization: 'Bearer ' + bearer
        }
      }
      if (lastId) {
        opts.qs.since_id = lastId
      }

      return request(opts).spread(function (response, body) {
        return JSON.parse(body)
      })
    }).then(function (data) {
      return setLastId('twitter', data.search_metadata.max_id).then(function() {
        return data.statuses
      })
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
    var opts = {
      url: 'https://api.instagram.com/v1/tags/'+ config.searchTerm +
      '/media/recent',
      qs: {
        client_id: process.env.IG_CLIENT,
        client_secret: process.env.IG_SECRET
      }
    }
    if (lastId) {
      opts.qs.min_id = lastId
    }
    return request(opts).spread(function(response, body) {
      return JSON.parse(body)
    }).then(function (body) {
      return setLastId('instagram', body.pagination.min_tag_id)
      .then(function () {
        return body.data
      })
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

    var opts = {
      url: 'http://api.tumblr.com/v2/tagged',
      qs: {
        tag: config.searchTerm,
        api_key: process.env.TUMBLR_CONSUMER
      }
    }
    if (lastId) {
      opts.qs.before = lastId
    }

    return request(opts).spread(function (response, body) {
      return JSON.parse(body)
    }).then(function (posts) {
      return setLastId('tumblr', Date.now()).then(function() {
        return posts
      })
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