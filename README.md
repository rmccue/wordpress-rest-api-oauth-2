# WordPress REST API OAuth 2 Client

JavaScript OAuth 2 Client for the WordPress REST API v2.

Based on https://github.com/WP-API/wordpress-rest-api-oauth-1

## Install

```
npm install --save wordpress-rest-api-oauth-2
```

## Configuration

### Without Authentication

```JS
import api from 'wordpress-rest-api-oauth-2'

const demoApi = new api({
	url: 'https://demo.wp-api.org/'
})
```
### Using OAuth 2 Directly

To communication and authenticate using OAuth 2 with your WordPress site directly:

```JS
import api from 'wordpress-rest-api-oauth-2'

const demoApi = new api({
	url: 'https://demo.wp-api.org/',
	credentials: {
		client: {
			id: 'xxxxxx',
			secret: 'xxxxxxxxxxxxxxxxxxx'
		}
	}
})
```

### Using the WordPress Authentication Broker

**WARNING: NOT YET SUPPORTED**

To establish a connection to a WordPress site that accepts the [WordPress REST API Broker](https://apps.wp-api.org/):

```JS
import api from 'wordpress-rest-api-oauth-2'

const demoApi = new api({
	url: 'https://demo.wp-api.org/',
	brokerCredentials: {
		client: {
			id: 'xxxxxx',
			secret: 'xxxxxxxxxxxxxxxxxxx'
		}
	}
})

// Get OAuth client tokens for the specified site. This is not needed if using `authorize()`.
demoApi.getClientCredentials().then( token => {
	console.log( token )
})
```

### Usage

#### Authorize / OAuth Flow

There is two ways to get authentication tokens, one "high level" function, or you can implement your own flow using the underlaying function.

##### The Quick Way

```JS
demoApi.authorize().then( function() {
	console.log( 'All API requests are now authenticated.' )
})

// Note: the above will cause a redirect / resume of the app in the event that the user needs to authorize.
```

##### Control your own flow

```JS
// Get client tokens from the broker (optional)
demoApi.getClientCredentials().then( ... )

// Optionally create state to avoid CSRF and store
const state = createRandomState()
localStorage.setItem( 'oauthState', state )

// Send user to authorisation page...
window.location = demoApi.getRedirectURL( state )

// After return, exchange code for access token (after checking state)
demo.getAccessToken( code )
	.then( token => {
		// save the token to localStorage etc.
	})
```

#### Make API Requests

The recommended way to make requests is to use the `API.fetch()` method just as you would use the `fetch()` function. This method does a few things for you:

* Resolves URLs relative to the API URL.
* Automatically adds the Authorization header

Use it the same way you'd use `fetch()`
```js
demoApi.fetch( 'wp/v2/posts' )
	.then( resp => resp.json() )
	.then( data => console.log( data ) )
```

You can also use the high-level helpers:

```JS
demoApi.get( '/wp/v2/posts', { per_page: 5 } ).then( posts => {
	console.log( posts )
})

demoApi.post( '/wp/v2/posts', { title: 'Test new post' } } ).then( post => {
	console.log( post )
})

demoApi.del( '/wp/v2/posts/1' ).then( post => {
	console.log( 'Deleted post.' )
})
```

### Loading and Saving Credentials

With OAuth in the browser, you don't typically want to run through the authorization flow on every page load, so you can export and import the credentials if you wish:

```JS
// init API with credentials:
new api({
	url: siteURL,
	credentials: JSON.parse( localStorage.getItem( 'authCredentials' ) )
})

// save the credentials
localStorage.setItem( 'authCredentials', JSON.stringify( demoApi.config.credentials ) )
```

You can also have the library store and retrieve the credentials:

```JS
demoApi.restoreCredentials().get( '/wp/v2/users/me' )

demoApi.saveCredentials() // Save the credentials to localStorage
```

To implement restoring of credentials and auth in one go:

```JS
demoApi.restoreCredentials().authorize().then( function() {
	demoApi.saveCredentials()
})
```
