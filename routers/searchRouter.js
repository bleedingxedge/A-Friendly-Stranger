/*jshint camelcase:false */
var express   = require('express')
var config    = require('../config')
var instagram = require('instagram-node')
var Promise   = require('bluebird')
var tumblr    = require('tumblr.js')
var Twit      = require('twit')

var router = express.Router()

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

function getTweets() {
  var searchTerm = '#' + config.searchTerm
  return twitterClient.getAsync('search/tweets', {q: searchTerm})
  .then(function (res) {
    // res -> [data, response]
    return res[0] && res[0].statuses
  })
}

function findInstagram() {
  return instagramClient.tag_media_recentAsync(config.searchTerm)
  .then(function (res) {
    // res -> [medias, pagination, limit]
    return res[0]
  })
}

function findTumblr() {
  return tumblrClient.taggedAsync(config.searchTerm)
}

router.get('/', function(req, res, next) {
  Promise.all([getTweets(), findInstagram(), findTumblr()])
  .spread(function (twitterData, instagramData, tumblrData) {
    var statusLength = (twitterData.length || 0) + (instagramData.length || 0) +
    (tumblrData.length || 0)
    res.send({
      twitter: twitterData,
      instagram: instagramData,
      tumblr: tumblrData,
      length: statusLength
    })
  }).catch(next)
})

module.exports = router