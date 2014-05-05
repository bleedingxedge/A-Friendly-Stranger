/*jshint camelcase:false */
var express   = require('express')
var config    = require('../config')
var instagram = require('instagram-node')
var Promise   = require('bluebird')
var tumblr    = require('tumblr.js')
var Twit      = require('twit')

var router = express.Router()

var twitterClient = new Twit({
  consumer_key: 'rZMGvmwPdkfTiR6Aqjy8RvSo7',
  consumer_secret: '2nH3BI7HIUxjkNJW8elrBfyB3lyT4kyLEuKFxe90T0CdhQWwMl',
  access_token: '3367771-I8ccGU4UUTaH5OUV6Q3YlkQoC0Hk7VWMH7Z6CwbUQf',
  access_token_secret: 'Yj85eg4fuL4aDV8l6cJrYZ0l2iFvAJKw4JQ5gFe2AxiUf',
})
Promise.promisifyAll(twitterClient)

var instagramClient = instagram.instagram()
instagramClient.use({
  client_id: '885de22d7010427681562ab71cd81127',
  client_secret: '0a88e2d362fb4b23b1d5c6c4d93a8a34'
})
Promise.promisifyAll(instagramClient)

var tumblrClient = new tumblr.Client({
  consumer_key: 'AgXEbbB61lQfHK9HfCXnDz0ZoNCN9HRobHHxJpbZ9gIf6RpgEt'
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