import qs from 'qs'

export default class {
	constructor( config ) {
		this.url = config.rest_url ? config.rest_url : ( config.url + 'wp-json' )
		this.url = this.url.replace( /\/$/, '' )
		this.credentials = config.credentials
		this.scope = config.scope || null

		if ( ! this.credentials.type ) {
			this.credentials.type = this.credentials.client.secret ? 'code' : 'token'
		}
		this.config = config
	}

	getConsumerToken() {
		if ( ! this.config.brokerCredentials ) {
			throw new Error( 'Config does not include a brokerCredentials value.' )
		}

		this.config.credentials.client = this.config.brokerCredentials.client
		return this.post( `${this.config.brokerURL}broker/connect`, {
			server_url: this.config.url,
		} ).then( data => {

			if ( data.status && data.status === 'error' ) {
				throw { message: `Broker error: ${data.message}`, code: data.type }
			}
			this.config.credentials.client = {
				id: data.client_token,
				secret: data.client_secret,
			}

			return data
		} )
	}

	getRedirectURL() {
		if ( ! this.config.callbackURL ) {
			throw new Error( 'Config does not include a callbackURL value.' )
		}

		const args = {
			response_type: this.credentials.type,
			client_id: this.credentials.client.id,
			redirect_uri: this.config.callbackURL,
		}
		if ( this.scope ) {
			args.scope = this.scope
		}
		return `${this.config.url}wp-login.php?action=oauth2_authorize&${qs.stringify(args)}`
	}

	getAccessToken( oauthVerifier ) {
		return this.post( `${this.config.url}oauth2/access`, {
			oauth_verifier: oauthVerifier,
		} ).then( data => {
			this.config.credentials.token = {
				public: data.oauth_token,
				secret: data.oauth_token_secret,
			}

			return this.config.credentials.token
		} )
	}

	getAuthorizationHeader() {
		return { Authorization: `Bearer ${this.config.credentials.token.public}` }
	}

	authorize( next ) {

		var args = {}
		var savedCredentials = window.localStorage.getItem( 'requestTokenCredentials' )
		if ( window.location.href.indexOf( '?' ) ) {
			args = qs.parse( window.location.href.split('?')[1] )
		}

		// Parse implicit token passed in fragment
		if ( window.location.href.indexOf( '#' ) && this.config.credentials.type === 'token' ) {
			args = qs.parse( window.location.hash.substring( 1 ) )
		}

		if ( ! this.config.credentials.client ) {
			return this.getConsumerToken().then( this.authorize.bind( this ) )
		}

		if ( this.config.credentials.token && this.config.credentials.token.public ) {
			return Promise.resolve("Success")
		}

		if ( savedCredentials ) {
			this.config.credentials = JSON.parse( savedCredentials )
			window.localStorage.removeItem( 'requestTokenCredentials' )
		}

		if ( args.access_token ) {
			this.config.credentials.token = {
				public: args.access_token
			}
			return Promise.resolve( this.config.credentials.token )
		}

		if ( ! this.config.credentials.token && ! savedCredentials ) {
			console.log( savedCredentials )
			window.localStorage.setItem( 'requestTokenCredentials', JSON.stringify( this.config.credentials ) )
			window.location = this.getRedirectURL()
			throw 'Redirect to authrization page...'
		} else if ( ! this.config.credentials.token && args.access_token ) {
			this.config.credentials.token.public = args.access_token
			return this.getAccessToken( args.oauth_verifier )
		}
	}

	saveCredentials() {
		window.localStorage.setItem( 'tokenCredentials', JSON.stringify( this.config.credentials ) )
	}

	removeCredentials() {
		delete this.config.credentials.token
		window.localStorage.removeItem( 'tokenCredentials' )
	}

	hasCredentials() {
		return this.config.credentials
			&& this.config.credentials.client
			&& this.config.credentials.client.public
			&& this.config.credentials.client.secret
			&& this.config.credentials.token
			&& this.config.credentials.token.public
			&& this.config.credentials.token.secret
	}

	restoreCredentials() {
		var savedCredentials = window.localStorage.getItem( 'tokenCredentials' )
		if ( savedCredentials ) {
			this.config.credentials = JSON.parse( savedCredentials )
		}
		return this
	}

	get( url, data ) {
		return this.request( 'GET', url, data )
	}

	post( url, data ) {
		return this.request( 'POST', url, data )
	}

	del( url, data, callback ) {
		return this.request( 'DELETE', url, data )
	}

	request( method, url, data = null ) {
		if ( url.indexOf( 'http' ) !== 0 ) {
			url = this.url + url
		}

		if ( method === 'GET' && data ) {
			url += `?${decodeURIComponent( qs.stringify(data) )}`
			data = null
		}

		var headers = {
			Accept: 'application/json'
		}

		const requestUrls = [
			`${this.config.url}oauth1/request`
		]

		/**
		 * Only attach the oauth headers if we have a request token, or it is a request to the `oauth/request` endpoint.
		 */
		if ( this.config.credentials.token || requestUrls.indexOf( url ) > -1 ) {
			headers = {...headers, ...this.getAuthorizationHeader()}
		}
		console.log( this.config, headers )

		return fetch( url, {
			method: method,
			headers: headers,
			mode: 'cors',
			body: ['GET','HEAD'].indexOf( method ) > -1 ? null : qs.stringify( data )
		} )
		.then( response => {
			if ( response.headers.get( 'Content-Type' ) && response.headers.get( 'Content-Type' ).indexOf( 'x-www-form-urlencoded' ) > -1 ) {
				return response.text().then( text => {
					return qs.parse( text )
				})
			}
			return response.text().then( text => {

				try {
					var json = JSON.parse( text )
				} catch( e ) {
					throw { message: text, code: response.status }
				}

				if ( response.status >= 300) {
					throw json
				} else {
					return response
				}
			})
		} )
	}
}
