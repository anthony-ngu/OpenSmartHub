var io = require('socket.io-client');
var fs = require('fs');
var securityCredentials = require('./securityCredentials.js');

var deviceTypeMap = {};
deviceTypeMap["Test"] = require('./devices/Test.js');
deviceTypeMap["Clock"] = require('./devices/Clock.js');
deviceTypeMap["Wemo"] = require('./devices/Wemo.js');
deviceTypeMap["SparkButton"] = require('./devices/SparkButton.js');
deviceTypeMap["WeatherUnderground"] = require("./devices/WeatherUnderground.js");
// TODO: Add new device types that you create here

// populated by config file
var deviceTypeDictionary = {};
var yourDevicesDictionary = {};
var yourScenariosDictionary = {};

// populated using the config file and our parsing mechanism
var runningDevicesDictionary = {};
var runningScenarios = [];

// Loads the scripts/devices from the json file
var ReadData = function(){
  var fileData;
  fs.readFile('./config.json', 'utf8', function (err, data) {
    if (err) throw err;
    fileData = JSON.parse(data);
    // console.log(fileData);

    deviceTypeDictionary = fileData.deviceTypes;
    yourDevicesDictionary = fileData.yourDevices;
    yourScenariosDictionary = fileData.yourScenarios;
    // console.log("deviceTypeDictionary-----------------");
    // console.log(deviceTypeDictionary);
    // console.log("yourDevicesDictionary-----------------");
    // console.log(yourDevicesDictionary);
    // console.log("yourScenariosDictionary-----------------");
    // console.log(yourScenariosDictionary);

    ClearRunningDictionaries();
    PopulateRunningDictionaries();
  });
};
ReadData();

fs.watch('./config.json', function (event, filename) {
  console.log('event is: ' + event);
  ReadData();
});

socket = io.connect(securityCredentials.WEBSITE_URL);

socket.on('connect', function(){
  socket.emit('authentication', {username: securityCredentials.USERACCOUNT_NAME, secret: securityCredentials.USERACCOUNT_KEY});
});
console.log("connection requested");


socket.on('config', function(data){
  //TODO: check the hash of the two files for differences, if there is a difference, then make the change.
  console.log('data');
  console.log(data);
  fs.writeFile('./config.json', data, function (err) {
    if (err) throw err;
    console.log('It\'s saved!');
  });
});

var ClearRunningDictionaries = function(){
  // removes all the listeners for the specific triggerNames
  for (var deviceName in runningDevicesDictionary) {
    var device = runningDevicesDictionary[deviceName];
    device.removeAllListeners();
    device.dispose();
    device = null;
  }

  // clears them out
  runningDevicesDictionary = {};
  runningScenarios = [];
};

// This needs to be outside of the PopulateRunningDictionaries function in order to make sure
// that the triggers get their proper action list, otherwise all triggers get the last action list
var AddRunningScenario = function(triggerDevice, customTriggerName, scenario)
{
  runningScenarios.push(triggerDevice.on(customTriggerName, function() {
    // Check the conditionals
    var listOfConditionals = scenario.trigger.conditionals;
    // console.log("list of conditionals");
    // console.log(listOfConditionals);
    var conditionalResult = true;
    for (var index in listOfConditionals)
    {
      var conditional = listOfConditionals[index];
      // console.log("Conditional");
      // console.log(conditional);
      var conditionalDevice = runningDevicesDictionary[conditional.device];
      if(conditionalDevice.data[conditional.data] != conditional.expectedValue)
      {
        conditionalResult = false;
        //print the mismatch for debug
        // console.log("conditional failed");
        // console.log("expectedValue: " + conditional.expectedValue);
        // console.log("actualValue: " + conditionalDevice.data[conditional.data])
      }else{
        // console.log("conditional true");
      }
    }

    if(conditionalResult)
    {
      // executes the list of actions
      for (var actionId in scenario.actions)
      {
        var action = scenario.actions[actionId];
        // console.log("action");
        // console.log(action);

        var actionDevice = runningDevicesDictionary[action.device];
        var actionName = action.action;
        var actionParams = action.params;

        if(!actionDevice) // skips any action that has a non-existant action device
        {
          continue;
        }
        actionDevice[actionName](actionParams);
      }
    }
  }));
};

// Populate the Running Dictionaries and make sure it works
// Populate the Running Device Dictionary
var PopulateRunningDictionaries = function()
{
  for (nameOfYourDevice in yourDevicesDictionary)
  {
    // Must be found in the default dictionary, if not, it is not added
    // console.log("--------------------------------");
    // console.log("nameOfYourDevice");
    // console.log(nameOfYourDevice);
    
    var type = yourDevicesDictionary[nameOfYourDevice]["type"];
    var params = yourDevicesDictionary[nameOfYourDevice]["params"];
    var defaultDevice = deviceTypeDictionary[type];
    // console.log("Default Device");
    // console.log(defaultDevice);
    // console.log("type");
    // console.log(type);
    // console.log("params");
    // console.log(params);

    // checks if the deviceType has been defined in config file and has a valid deviceTypeMap entry
    if(defaultDevice && deviceTypeMap[type])
    {
      runningDevicesDictionary[nameOfYourDevice] = new deviceTypeMap[type](params);
    }
  }
  // console.logconsole.log("--------------------------------");
  // Populate the script dictionaries
  for (scenarioId in yourScenariosDictionary)
  {
    var scenario = yourScenariosDictionary[scenarioId];
    // console.log("scenario");
    // console.log(scenario);
    // console.log("trigger")
    // console.log(scenario.trigger);
    // console.log("actions");
    // console.log(scenario.actions);

    var triggerDevice = runningDevicesDictionary[scenario.trigger.device];
    var triggerName = scenario.trigger.trigger;
    var customTriggerName = scenario.trigger.customTrigger;
    var triggerParams = scenario.trigger.params;

    // skips any scenarios that has any of the following:
    //  non-existant trigger device
    //  non-existant trigger name
    if(!triggerDevice || !triggerDevice[triggerName]) 
    {
      continue;
    }
    // console.log("--------------------------------");
    // console.log("triggerDevice");
    // console.log(triggerDevice);
    // console.log("triggerName")
    // console.log(triggerName);
    // console.log("customTriggerName");
    // console.log(customTriggerName);
    // console.log("triggerParams");
    // console.log(triggerParams);

    triggerDevice[triggerName](customTriggerName, triggerParams); // this sets up the trigger event

    // This handles the actions to perform on trigger
    AddRunningScenario(triggerDevice, customTriggerName, scenario);
  }

  // Print out for visual check of all of the stored values
  console.log("runningDevicesDictionary----------------------");
  console.log(runningDevicesDictionary);
  console.log("runningScenarios----------------------");
  console.log(runningScenarios);
}