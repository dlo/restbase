"use strict";

/*
 * Simple RestFace server
 *
 * Using node 0.11+:
 *   node --harmony restface
 *
 * Simple benchmark:
 * ab -c10 -n10000 'http://localhost:8888/v1/enwiki/pages/foo/rev/latest/html'
 */

var fs = require('fs');
//var prfun = require('prfun');
var Verbs = require('./Verbs');
var http = require('http');
var url = require('url');
var RouteSwitch = require('routeswitch');

    // TODO: use bunyan or the Parsoid logger backend!
var log = function (level) {
    var msg = JSON.stringify(Array.prototype.slice.call(arguments), null, 2);
    if (/^error/.test(level)) {
        console.error(msg);
    } else {
        console.log(msg);
    }
};
var app = {};

// Optimized URL parsing
var qs = require('querystring');
// Should make it into 0.12, see https://github.com/joyent/node/pull/7878
var SIMPLE_PATH = /^(\/(?!\/)[^\?#\s]*)(\?[^#\s]*)?$/;
function parseURL (uri) {
    // Fast path for simple path uris
    var fastMatch = SIMPLE_PATH.exec(uri);
    if (fastMatch) {
        return {
            protocol: null,
            slashes: null,
            auth: null,
            host: null,
            port: null,
            hostname: null,
            hash: null,
            search: fastMatch[2] || '',
            pathname: fastMatch[1],
            path: fastMatch[1],
            query: fastMatch[2] && qs.parse(fastMatch[2]) || {},
            href: uri
        };
    } else {
        return url.parse(uri, true);
    }
}

// Handle a single request
function handleRequest (req, resp) {
    //log('request', 'New request:', req.url);
    var urlData = parseURL(req.url);

    // Create the virtual HTTP service
    var verbs = new Verbs(null, {}, app.frontendRouter, app.backendRouter);
    var newReq = {
        uri: urlData.pathname,
        query: urlData.query,
        method: req.method.toLowerCase(),
        headers: req.headers
    };
    return verbs.request(newReq)
    .then(function(response) {
        console.log('resp', response);
        var body = response.body;
        if (body) {
            // Convert to a buffer
            if (body.constructor === Object) {
                body = new Buffer(JSON.stringify(body));
            } else if (body.constructor !== Buffer) {
                body = new Buffer(body);
            }
            response.headers.Connection = 'close';
            response.headers['Content-Length'] = body.length;
            resp.writeHead(response.status || 500, '', response.headers);
            resp.end(body);
        } else {
            resp.writeHead(response.status || 500, '', response.headers);
            resp.end();
        }

    })
    .catch (function(e) {
        log('error/request', e, e.stack);
        // XXX: proper error reporting
        resp.writeHead(500, "Internal error");
        resp.end(e);
    });
}

// Main app setup
function main() {
    // Load handlers & set up routers
    return Promise.all([
            RouteSwitch.fromHandlers('./handlers/frontend', log),
            RouteSwitch.fromHandlers('./handlers/backend', log)
            ])
    .then(function(routers) {
        app.frontendRouter = routers[0];
        app.backendRouter = routers[1];
        var server = http.createServer(handleRequest);
        server.listen(8888);
        log('notice', 'listening on port 8888');
    })
    .catch(function(e) {
        log('error', e, e.stack);
    });
}

main();
