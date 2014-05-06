var chai = require('chai')
var media = require('../lib/media')
chai.should()

describe('Media', function () {
  describe('Normal', function () {
    before(function (done) {
      var _this = this
      media().then(function (data) {
        _this.data = data
        done()
      }).catch(done)
    })

    it('should return all types of data', function () {
      var data = this.data
      data.should.have.length(30)
    })

    it('should have media conforming to spec', function () {
      var data = this.data
      data.forEach(function (item) {
        item.should.include.key('source')
        item.should.include.key('id')
        item.should.include.key('url')
        item.should.include.key('caption')
        item.should.include.key('photo')
        item.should.include.key('user')
        item.should.include.key('createdAt')
      })
    })
  })
})