'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.parseResponse = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _qs = require('qs');

var _qs2 = _interopRequireDefault(_qs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _class = function () {
	function _class(config) {
		_classCallCheck(this, _class);

		this.url = config.rest_url ? config.rest_url : config.url + 'wp-json';
		this.url = this.url.replace(/\/$/, '');
		this.credentials = Object.assign({}, config.credentials);
		this.scope = config.scope || null;

		if (!this.credentials.type) {
			this.credentials.type = this.credentials.client.secret ? 'code' : 'token';
		}
		this.config = config;
	}

	_createClass(_class, [{
		key: 'getClientCredentials',
		value: function getClientCredentials() {
			var _this = this;

			if (!this.config.brokerCredentials) {
				throw new Error('Config does not include a brokerCredentials value.');
			}

			this.credentials.client = this.config.brokerCredentials.client;
			return this.post(this.config.brokerURL + 'broker/connect', {
				server_url: this.config.url
			}).then(function (data) {

				if (data.status && data.status === 'error') {
					throw { message: 'Broker error: ' + data.message, code: data.type };
				}
				_this.credentials.client = {
					id: data.client_token,
					secret: data.client_secret
				};

				return data;
			});
		}
	}, {
		key: 'getRedirectURL',
		value: function getRedirectURL(state) {
			if (!this.config.callbackURL) {
				throw new Error('Config does not include a callbackURL value.');
			}

			var args = {
				response_type: this.credentials.type,
				client_id: this.credentials.client.id,
				redirect_uri: this.config.callbackURL
			};
			if (this.scope) {
				args.scope = this.scope;
			}
			if (state) {
				args.state = state;
			}
			return this.url + '/oauth2/authorize?' + _qs2.default.stringify(args);
		}
	}, {
		key: 'getAccessToken',
		value: function getAccessToken(code) {
			var _this2 = this;

			var args = {
				grant_type: 'authorization_code',
				client_id: this.credentials.client.id,
				redirect_uri: this.config.callbackURL,
				code: code
			};
			var opts = {
				method: 'POST',
				mode: 'cors',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: _qs2.default.stringify(args)
			};

			if ('secret' in this.credentials.client) {
				var encodedAuth = btoa(this.credentials.client.id + ':' + this.credentials.client.secret);
				opts.headers.Authorization = 'Basic ' + encodedAuth;
				delete args.client_id;
			}

			return fetch(this.url + '/oauth2/access_token', opts).then(function (resp) {
				return resp.json().then(function (data) {
					if (!resp.ok) {
						throw new Error(data.message);
					}
					_this2.credentials.token = {
						public: data.access_token
					};

					return _this2.credentials.token;
				});
			});
		}
	}, {
		key: 'getAuthorizationHeader',
		value: function getAuthorizationHeader() {
			if (!this.credentials.token) {
				return {};
			}

			return { Authorization: 'Bearer ' + this.credentials.token.public };
		}
	}, {
		key: 'authorize',
		value: function authorize(next) {

			var args = {};
			var savedCredentials = window.localStorage.getItem('requestTokenCredentials');

			// Parse implicit token passed in fragment
			if (savedCredentials) {
				if (window.location.href.indexOf('?')) {
					args = _qs2.default.parse(window.location.href.split('?')[1]);
				}
				if (window.location.href.indexOf('#') && this.credentials.type === 'token') {
					args = _qs2.default.parse(window.location.hash.substring(1));

					// Remove the hash if we can.
					if (window.history.pushState) {
						window.history.pushState(null, null, window.location.href.split('#')[0]);
					} else {
						window.location.hash = '';
					}
				}
			}

			if (!this.credentials.client) {
				return this.getClientCredentials().then(this.authorize.bind(this));
			}

			if (this.credentials.token) {
				if (this.credentials.token.public) {
					return Promise.resolve("Success");
				}

				// We have an invalid token stored
				return Promise.reject(new Error('invalid_stored_token'));
			}

			if (savedCredentials) {
				this.credentials = JSON.parse(savedCredentials);
				window.localStorage.removeItem('requestTokenCredentials');
			}

			if (args.access_token) {
				this.credentials.token = {
					public: args.access_token
				};
				return Promise.resolve(this.credentials.token);
			}

			// No token yet, and no attempt, so redirect to authorization page.
			if (!savedCredentials) {
				console.log(savedCredentials);
				window.localStorage.setItem('requestTokenCredentials', JSON.stringify(this.credentials));
				window.location = this.getRedirectURL();
				throw 'Redirect to authrization page...';
			}

			// Attempted, and we have a code.
			if (args.code) {
				return this.getAccessToken(args.code);
			}

			// Attempted, and we have an error.
			if (args.error) {
				return Promise.reject(new Error(args.error));
			}

			// Attempted, but no code or error, so user likely manually cancelled the process.
			// Delete the saved credentials, and try again.
			this.credentials = Object.assign({}, this.config.credentials);
			if (!this.credentials.type) {
				this.credentials.type = this.credentials.client.secret ? 'code' : 'token';
			}
			return this.authorize();
		}
	}, {
		key: 'saveCredentials',
		value: function saveCredentials() {
			window.localStorage.setItem('tokenCredentials', JSON.stringify(this.credentials));
		}
	}, {
		key: 'removeCredentials',
		value: function removeCredentials() {
			delete this.credentials.token;
			window.localStorage.removeItem('tokenCredentials');
		}
	}, {
		key: 'hasCredentials',
		value: function hasCredentials() {
			return this.credentials && this.credentials.client && this.credentials.client.id && this.credentials.token && this.credentials.token.public;
		}
	}, {
		key: 'restoreCredentials',
		value: function restoreCredentials() {
			var savedCredentials = window.localStorage.getItem('tokenCredentials');
			if (savedCredentials) {
				this.credentials = JSON.parse(savedCredentials);
			}
			return this;
		}
	}, {
		key: 'get',
		value: function get(url, data) {
			return this.request('GET', url, data);
		}
	}, {
		key: 'post',
		value: function post(url, data) {
			return this.request('POST', url, data);
		}
	}, {
		key: 'del',
		value: function del(url, data) {
			return this.request('DELETE', url, data);
		}
	}, {
		key: 'request',
		value: function request(method, url) {
			var data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

			if (url.indexOf('http') !== 0) {
				url = this.url + url;
			}

			if (method === 'GET' && data) {
				url += '?' + decodeURIComponent(_qs2.default.stringify(data));
				data = null;
			}

			var headers = {
				Accept: 'application/json'

				/**
     * Only attach the oauth headers if we have a request token
     */
			};if (this.credentials.token) {
				headers = _extends({}, headers, this.getAuthorizationHeader());
			}

			var opts = {
				method: method,
				headers: headers,
				mode: 'cors',
				body: ['GET', 'HEAD'].indexOf(method) > -1 ? null : _qs2.default.stringify(data)
			};

			return fetch(url, opts).then(parseResponse);
		}
	}, {
		key: 'fetch',
		value: function (_fetch) {
			function fetch(_x, _x2) {
				return _fetch.apply(this, arguments);
			}

			fetch.toString = function () {
				return _fetch.toString();
			};

			return fetch;
		}(function (url, options) {
			// Make URL absolute
			var relUrl = url[0] === '/' ? url.substring(1) : url;
			var absUrl = new URL(relUrl, this.url + '/');

			// Clone options
			var actualOptions = _extends({ headers: {} }, options);

			/**
    * Only attach the oauth headers if we have a request token
    */
			if (this.credentials.token) {
				actualOptions.headers = _extends({}, actualOptions.headers, this.getAuthorizationHeader());
			}

			return fetch(absUrl, actualOptions);
		})
	}]);

	return _class;
}();

exports.default = _class;
var parseResponse = exports.parseResponse = function parseResponse(resp) {
	return resp.json().then(function (data) {
		if (resp.ok) {
			Object.defineProperty(data, 'response', {
				get: function get() {
					return resp;
				}
			});
			return data;
		}

		// Build an error
		var err = new Error(data.message);
		err.code = data.code;
		err.data = data.data;
		throw err;
	});
};