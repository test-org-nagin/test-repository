/**
 * Copyright 2015-2017 IBM
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
/**
 * Licensed Materials - Property of IBM
 * © Copyright IBM Corp. 2015-2017
 */
var Kafka = {};
var MessageHubAdminRest = require('message-hub-rest');
var ProducerLoop = require('./producerLoop.js');
var ConsumerLoop = require('./consumerLoop.js');
var fs = require('fs');

var adminRestInstance;
var opts = {};
//var topicName = 'kafka-nodejs-console-sample-topic';
var topicName = 'sdm-kpi-event-simulator-topic';
//var runProducer = false;
//var runConsumer = false;
var producer, consumer;
var services;

if (process.env.VCAP_SERVICES) {
    // Running in Bluemix
    Kafka = require('node-rdkafka-prebuilt');
    console.log("Running in Bluemix mode.");

    services = JSON.parse(process.env.VCAP_SERVICES);
    for (var key in services) {
        if (key.lastIndexOf('messagehub', 0) === 0) {
            messageHubService = services[key][0];
            opts.brokers = messageHubService.credentials.kafka_brokers_sasl;
            opts.username = messageHubService.credentials.user;
            opts.password = messageHubService.credentials.password;
        }
    }
    adminRestInstance = new MessageHubAdminRest(services);

    opts.calocation = '/etc/ssl/certs';
    
} else {
    // Running locally on development machine
    Kafka = require('node-rdkafka');
    console.log("Running in local mode.");

    if (process.argv.length < 6) {
        console.log('ERROR: It appears the application is running outside of Bluemix but the arguments are incorrect for local mode.');
        console.log('\nUsage:\n' +
                'node ' + process.argv[1] + ' <kafka_brokers_sasl> <kafka_admin_url> <api_key> <cert_location> [ -consumer | -producer ]\n');
        process.exit(-1);
    }

    opts.brokers = process.argv[2];
    var restEndpoint = process.argv[3];
    var apiKey = process.argv[4];
    opts.username = apiKey.substring(0,16);
    opts.password = apiKey.substring(16);

    services = {
        "messagehub": [
           {
              "label": "messagehub",
              "credentials": {
                 "api_key": apiKey,
                 "kafka_rest_url": restEndpoint,
              }
           }
        ]
    };
    adminRestInstance = new MessageHubAdminRest(services);
    
    // Bluemix/Ubuntu: '/etc/ssl/certs'
    // Red Hat: '/etc/pki/tls/cert.pem',
    // Mac OS X: select System root certificates from Keychain Access and export as .pem on the filesystem
    opts.calocation = process.argv[5];
    if (! fs.existsSync(opts.calocation)) {
        console.error('Error - Failed to access <cert_location> : ' + opts.calocation);
        process.exit(-1);
    }

    // In local mode the app can run only the producer or only the consumer
    if (process.argv.length === 7) {
        if ('-consumer' === process.argv[6])
            runProducer = false;
        if ('-producer' === process.argv[6])
            runConsumer = false;
    }
}

console.log("Kafka Endpoints: " + opts.brokers);
console.log("Admin REST Endpoint: " + adminRestInstance.url.format());

if (!opts.hasOwnProperty('brokers') || !opts.hasOwnProperty('username') || !opts.hasOwnProperty('password') || !opts.hasOwnProperty('calocation')) {
    console.error('Error - Failed to retrieve options. Check that app is bound to a Message Hub service or that command line options are correct.');
    process.exit(-1);
}

// Shutdown hook
function shutdown(retcode) {
    if (producer && producer.isConnected()) {
        try {
            // Not supported yet !
            //producer.flush(1000);
        } catch (err) {
            console.log(err);
        }
        producer.disconnect();
    }
    if (consumer && consumer.isConnected()) {
        consumer.disconnect();
    }
    clearInterval(ConsumerLoop.consumerLoop);
    process.exit(retcode);
}

process.on('SIGTERM', function() {
    console.log('Shutdown received.');
    shutdown(0);
});
process.on('SIGINT', function() {
    console.log('Shutdown received.');
    shutdown(0);
});


// Use Message Hub's REST admin API to create the topic 
// with 1 partition and a retention period of 24 hours.
console.log('Creating the topic ' + topicName + ' with Admin REST API');
adminRestInstance.topics.create(topicName, 1, 24)
.then(function(response) {
    // If response is an empty object, then the topic was created
    if (Object.keys(response).length === 0 && response.constructor === Object) console.log('Topic ' + topicName + ' created');
    else console.log(response);
})
.fail(function(error) {
    console.log(error);
})
.done(function() {
    // Use Message Hub's REST admin API to list the existing topics
    adminRestInstance.topics.get()
    .then(function(response) {
        console.log('Admin REST Listing Topics:');
        console.log(response);
    })
    .fail(function(error) {
        console.log(error);
    })
    .done(function() {
		startServer();
    });
});

console.log("get topics");
adminRestInstance.topics.get() 
.then(function(response) {
    // If response is an empty object, then the topic was created
	console.log("topics: "+JSON.parse(response));
})

function startServer() {
	
	http = require('http');
	express = require('express');
	app = express();
	server = http.createServer(app);
	io = require('socket.io')(server);
	if (process.env.VCAP_SERVICES) {
	    // get the app environment from Cloud Foundry1
		var cfenv = require('cfenv');
		var appEnv = cfenv.getAppEnv();
		console.log("appEnv: "+JSON.stringify(appEnv));
    	server.listen(appEnv.port, function() {
  			console.log("server starting on " + appEnv.url);
		});
   	} else {
	    var portfinder = require('portfinder');
		portfinder.getPort(function (err, port) {
			server.listen(port, function() {
  				console.log("server starting on 0.0.0.0:" + port);
			});
	    });		
	};

	app.engine('jade', require('jade').__express) //__
	app.set('view engine', 'jade')
	app.get('/', function (req, res) {
  		res.render('home3')
	});


	var count = 0

	io.on('connection', function (socket) {
		console.log('io.on connection occurred ');

  		count++

  		io.emit('news', { msg: 'One more person is online', count: count });
  		socket.emit('private', { msg: 'Welcome you are the ' + count + ' person here' });


  		socket.on('private', function (data) {
			console.log('socket.on private occurred ');
    		console.log(data);
  		});

  		socket.on('subscribe', function (data) {
			console.log('socket.on subscribe occurred ')
    		console.log(data);
			var runOpts = JSON.parse(data);
    		console.log(`runOpts: ${JSON.stringify(runOpts)}`);
			runLoops(socket,runOpts,false,true);
  		});
		
		socket.on('publish', function (data) {
			console.log('publish occurred ')
    		console.log(data);
			var runOpts = JSON.parse(data);
    		console.log(`runOpts: ${JSON.stringify(runOpts)}`);
			runLoops(socket,runOpts,true,false);

  		});

  	});

};


// Build and start the producer/consumer
function runLoops(socket,runOpts,runProducer,runConsumer) {
	console.log("runLoops() entered.");
    // Config options common to both consumer and producer
    var driver_options = {
        //'debug': 'all',
        'metadata.broker.list': opts.brokers,
        'security.protocol': 'sasl_ssl',
        'ssl.ca.location': opts.calocation,
        'sasl.mechanisms': 'PLAIN',
        'sasl.username': opts.username,
        'sasl.password': opts.password
    };

    var consumer_opts = {
        'client.id': 'kafka-nodejs-console-sample-consumer',
        'group.id': 'kafka-nodejs-console-sample-group'
    };

    var producer_opts = {
        'client.id': 'kafka-nodejs-console-sample-producer',
        'dr_msg_cb': true  // Enable delivery reports with message payload
    };

    // Add the common options to client and producer
    for (var key in driver_options) { 
        consumer_opts[key] = driver_options[key];
        producer_opts[key] = driver_options[key];
    }
    console.log("SDM Start the clients.");
    // Start the clients
    if (runProducer) {
        producer = ProducerLoop.buildProducer(Kafka, producer_opts, shutdown, socket, runOpts);
        producer.connect();
		var timeoutPeriod = runOpts.period.seconds * 1000;
		timeoutPeriod += runOpts.period.minutes * 60000;
		timeoutPeriod += runOpts.period.hours * 3600000;
		timeoutPeriod += runOpts.period.days * 86400000;
		console.log("producer timeout period is: "+timeoutPeriod);
		var timeout = setTimeout(function () {
			console.log("producer timeout");
			if (producer.isConnected()) {
               	producer.disconnect();
            };
			clearTimeout(timeout);				
        }, timeoutPeriod);

    }

    if (runConsumer) {
        consumer = ConsumerLoop.buildConsumer(Kafka, consumer_opts, topicName, shutdown, socket, runOpts);
		console.log(`runOpts: ${JSON.stringify(runOpts)}`);
        consumer.connect();
		var timeoutPeriod = runOpts.period.seconds * 1000;
		timeoutPeriod += runOpts.period.minutes * 60000;
		timeoutPeriod += runOpts.period.hours * 3600000;
		timeoutPeriod += runOpts.period.days * 86400000;
		console.log("consumer timeout period is: "+timeoutPeriod);
		var timeout = setTimeout(function () {
			console.log("consumer timeout");			
			if (consumer.isConnected()) {
               	consumer.disconnect();
            };
			clearTimeout(timeout);			
        }, timeoutPeriod);
    }
	console.log("SDM Start the clients completed.");

};

