import qs from 'qs'

export default class {
	constructor( config ) {
		this.url = config.rest_url ? config.rest_url : ( config.url + 'wp-json' )
		this.url = this.url.replace( /\/$/, '' )
		this.credentials = Object.assign( {}, config.credentials )
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

		this.credentials.client = this.config.brokerCredentials.client
		return this.post( `${this.config.brokerURL}broker/connect`, {
			server_url: this.config.url,
		} ).then( data => {

			if ( data.status && data.status === 'error' ) {
				throw { message: `Broker error: ${data.message}`, code: data.type }
			}
			this.credentials.client = {
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
		const args = {
			grant_type: 'authorization_code',
			client_id: this.credentials.client.id,
			redirect_uri: this.config.callbackURL,
			code: oauthVerifier,
		}
		const opts = {
			method: 'POST',
			mode: 'cors',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: qs.stringify( args ),
		}
		return fetch( `${this.url}/oauth2/access_token`, opts ).then( resp => resp.json() ).then( data => {
			this.credentials.token = {
				public: data.access_token,
			}

			return this.credentials.token
		} )
	}

	getAuthorizationHeader() {
		if ( ! this.credentials.token ) {
			return {}
		}

		return { Authorization: `Bearer ${this.credentials.token.public}` }
	}

	authorize( next ) {

		var args = {}
		var savedCredentials = window.localStorage.getItem( 'requestTokenCredentials' )
		if ( window.location.href.indexOf( '?' ) ) {
			args = qs.parse( window.location.href.split('?')[1] )
		}

		// Parse implicit token passed in fragment
		if ( window.location.href.indexOf( '#' ) && this.credentials.type === 'token' ) {
			args = qs.parse( window.location.hash.substring( 1 ) )
		}

		if ( ! this.credentials.client ) {
			return this.getConsumerToken().then( this.authorize.bind( this ) )
		}

		if ( this.credentials.token ) {
			if ( this.credentials.token.public ) {
				return Promise.resolve("Success")
			}

			// We have an invalid token stored
			return Promise.reject( new Error( 'invalid_stored_token' ) )
		}

		if ( savedCredentials ) {
			this.credentials = JSON.parse( savedCredentials )
			window.localStorage.removeItem( 'requestTokenCredentials' )
		}

		if ( args.access_token ) {
			this.credentials.token = {
				public: args.access_token
			}
			return Promise.resolve( this.credentials.token )
		}

		// No token yet, and no attempt, so redirect to authorization page.
		if ( ! savedCredentials ) {
			console.log( savedCredentials )
			window.localStorage.setItem( 'requestTokenCredentials', JSON.stringify( this.credentials ) )
			window.location = this.getRedirectURL()
			throw 'Redirect to authrization page...'
		}

		// Attempted, and we have a code.
		if ( args.code ) {
			return this.getAccessToken( args.code )
		}

		// Attempted, and we have an error.
		if ( args.error ) {
			return Promise.reject( new Error( args.error ) )
		}

		// Attempted, but no code or error, so user likely manually cancelled the process.
		// Delete the saved credentials, and try again.
		this.credentials = Object.assign( {}, config.credentials )
		return this.authorize()
	}

	saveCredentials() {
		window.localStorage.setItem( 'tokenCredentials', JSON.stringify( this.credentials ) )
	}

	removeCredentials() {
		delete this.credentials.token
		window.localStorage.removeItem( 'tokenCredentials' )
	}

	hasCredentials() {
		return this.credentials
			&& this.credentials.client
			&& this.credentials.client.public
			&& this.credentials.client.secret
			&& this.credentials.token
			&& this.credentials.token.public
			&& this.credentials.token.secret
	}

	restoreCredentials() {
		var savedCredentials = window.localStorage.getItem( 'tokenCredentials' )
		if ( savedCredentials ) {
			this.credentials = JSON.parse( savedCredentials )
		}
		return this
	}

	get( url, data ) {
		return this.request( 'GET', url, data )
	}

	post( url, data ) {
		return this.request( 'POST', url, data )
	}

	del( url, data ) {
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
		if ( this.credentials.token || requestUrls.indexOf( url ) > -1 ) {
			headers = {...headers, ...this.getAuthorizationHeader()}
		}

		return fetch( url, {
			method: method,
			headers: headers,
			mode: 'cors',
			body: ['GET','HEAD'].indexOf( method ) > -1 ? null : qs.stringify( data )
		} )
	}
}
