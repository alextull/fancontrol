// ------------
// Fan Controller
// ------------

#include <stdlib.h>
#include <string.h>

// This #include statement was automatically added by the Particle IDE.
#include <HttpClient.h>

/*-------------

We've heavily commented this code for you. If you're a pro, feel free to ignore it.

Comments start with two slashes or are blocked off by a slash and a star.
You can read them, but your device can't.
It's like a secret message just for you.

Every program based on Wiring (programming language used by Arduino, and Particle devices) has two essential parts:
setup - runs once at the beginning of your program
loop - runs continuously over and over

-------------*/

/**
 * Define your settings here
 */
#define RELAY2 D4
#define RELAY3 D5
#define RELAY4 D6
#define HOST_IP "192.168.178.115"
#define HOST_PORT 3033

// Shared secret sent in every request to /getFanLevel.
// Must match the PHOTON_SECRET environment variable on the Node.js server.
// To enable: set HOST_SECRET to your secret string and set HOST_SECRET_ENABLED to 1.
// To disable: set HOST_SECRET_ENABLED to 0 (server must also have PHOTON_SECRET unset).
#define HOST_SECRET ""
#define HOST_SECRET_ENABLED 0

// Number of consecutive HTTP failures before logging an error (avoids single-blip noise)
#define ERROR_THRESHOLD 3

// Fixed-size buffer for the HTTP response body.
// The payload format is e.g. "FCS4FLV2PWR0145HR098SPD025.3" (~28 chars).
// 64 bytes gives ample headroom while keeping stack usage bounded.
#define MAX_BODY_LEN 64

/**
* Declaring the variables.
*/
unsigned int nextTime = 0;    // Next time to contact the server
int loopCounter = 0;
int fanLevel = 0;
int consecutiveErrors = 0;    // Tracks consecutive HTTP failures

HttpClient http;

// Headers currently need to be set at init, useful for API keys etc.
// When HOST_SECRET_ENABLED is 1, the X-Photon-Secret header is included so
// the Node.js server can authenticate requests from this device.
#if HOST_SECRET_ENABLED
http_header_t headers[] = {
    { "Accept",          "*/*"       },
    { "X-Photon-Secret", HOST_SECRET },
    { NULL, NULL } // NOTE: Always terminate headers with NULL
};
#else
http_header_t headers[] = {
    { "Accept", "*/*" },
    { NULL, NULL } // NOTE: Always terminate headers with NULL
};
#endif

http_request_t request;
http_response_t response;


// Having declared these variables, let's move on to the setup function.
// The setup function is a standard part of any microcontroller program.
// It runs only once when the device boots up or is reset.

void resetPins() {
    Serial.println("FanController.resetPins(): entry.");
    digitalWrite(RELAY2, LOW);
    digitalWrite(RELAY3, LOW);
    digitalWrite(RELAY4, LOW);
    fanLevel = -1;  // force relay update on next successful response
    Serial.println("FanController.resetPins(): done.");
}

void httpRequestBodyHandler(const char *data) {
    // Use a fixed-size buffer instead of a VLA to keep stack usage bounded
    // and prevent a stack overflow if the server ever returns an oversized body.
    char body[MAX_BODY_LEN];
    strncpy(body, data, MAX_BODY_LEN - 1);
    body[MAX_BODY_LEN - 1] = '\0';

    // Locate the "FLV" token rather than relying on a hardcoded byte offset,
    // so the parse stays correct even if the preceding fields change width.
    char *flvPtr = strstr(body, "FLV");
    if (flvPtr == NULL) {
        Serial.printlnf("httpRequestBodyHandler(): ERROR — 'FLV' token not found in body: \"%s\"", body);
        return;
    }
    int flv = atoi(flvPtr + 3);
    int prevLevel = fanLevel;

    if (fanLevel != flv) {
        resetPins();
        switch ( flv ) {
            case 1 : 
                digitalWrite(RELAY2, HIGH);
                break;
            case 2 :
                digitalWrite(RELAY3, HIGH);
                break;
            case 3 :
                digitalWrite(RELAY4, HIGH);
        }
        fanLevel = flv;
        // Log only when the fan level actually changes
        Serial.printlnf("httpRequestBodyHandler(): fan level changed %d -> %d", prevLevel, fanLevel);
    } else {
        Serial.printlnf("httpRequestBodyHandler(): fan level unchanged: %d", fanLevel);
    }
}

void setupPins() {
    Serial.println("FanController.setupPins(): entry.");
    
    pinMode(RELAY2, OUTPUT);
    Serial.println("FanController.setupPins(): RELAY2 mode OUTPUT");
    pinMode(RELAY3, OUTPUT);
    Serial.println("FanController.setupPins(): RELAY3 mode OUTPUT");
    pinMode(RELAY4, OUTPUT);
    Serial.println("FanController.setupPins(): RELAY4 mode OUTPUT");
    
    Serial.println("FanController.setupPins(): done.");
}

void setupHttpRequest() {
    Serial.println("FanController.setupHttpRequest(): entry."); 
    
    // Request path and body can be set at runtime or at setup.
    // IP of the host running the node.js app
    request.hostname = HOST_IP;  
    // port of the node.js express app
    request.port = HOST_PORT;
    request.path = "/getFanLevel";
    Serial.printlnf("FanController.setupHttpRequest(): %s:%d%s", HOST_IP, HOST_PORT, request.path);
    
    Serial.println("FanController.setupHttpRequest(): done.");
}
          


void setup() {

    // wait 3 seconds to read serial output if necessary
    delay(3000);
    // It's important you do this here, inside the setup() function rather than outside it or in the loop function.
    Serial.begin();
    Serial.println("FanController.setup()");
    setupPins();
    Serial.println("FanController.setup(): pins setup");
    setupHttpRequest();
    delay(5000);

}

// Next we have the loop function, the other essential part of a microcontroller program.
// This routine gets repeated over and over, as quickly as possible and as many times as possible, after the setup function is called.
// Note: Code that blocks for too long (like more than 5 seconds), can make weird things happen (like dropping the network connection).  The built-in delay function shown below safely interleaves required background activity, so arbitrarily long delays can safely be done if you need them.

void loop() {
    
    if (nextTime > millis()) {
        return;
    }

    // Measure HTTP request latency
    unsigned long t0 = millis();
    http.get(request, response, headers);
    unsigned long latency = millis() - t0;

    Serial.printlnf("loop()[#%d t=%lums]: GET %s:%d%s -> status=%d latency=%lums",
        ++loopCounter, millis(), HOST_IP, HOST_PORT, request.path,
        response.status, latency);

    if (response.status == 200) {
        // Successful response — reset error counter
        if (consecutiveErrors > 0) {
            Serial.printlnf("loop(): connection restored after %d consecutive error(s)", consecutiveErrors);
            consecutiveErrors = 0;
        }
        Serial.printlnf("loop(): response body: \"%s\"", response.body);
        httpRequestBodyHandler(response.body);
    } else {
        consecutiveErrors++;
        // Log every individual failure at debug level
        Serial.printlnf("loop(): ERROR status=%d (consecutive errors: %d)", response.status, consecutiveErrors);
        // Log a prominent warning once the threshold is crossed
        if (consecutiveErrors == ERROR_THRESHOLD) {
            Serial.printlnf("loop(): WARNING — %d consecutive HTTP failures, check connection to %s:%d",
                consecutiveErrors, HOST_IP, HOST_PORT);
        }
        resetPins();
    }

    // delay between HTTP requests
    nextTime = millis() + 5000;
}
