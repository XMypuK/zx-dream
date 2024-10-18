function Gamepad() {
    'use strict';

    var devices = [];
    var states = {};
    var onGamepadConnected = new ZX_Event();
    var onGamepadDisconnected = new ZX_Event();
    var onKeyStateChanged = new ZX_Event();

    window.addEventListener('gamepadconnected', function (event) {
        onGamepadConnected.emit(event.gamepad);
    });

    window.addEventListener('gamepaddisconnected', function (event) {
        onGamepadDisconnected.emit(event.gamepad);
    });

    function pollGamepads() {
        if (devices.length == 0)
            return;
 
        var navigatorGamepads = navigator.getGamepads && navigator.getGamepads() || [];
        var newStates = {};
        for (var i = 0; i < devices.length; i++) {
            var gp = navigatorGamepads[devices[i].index];
            if (!gp)
                continue;
            var map = devices[i].map;
            for (var buttonIndex = 0; buttonIndex < map.buttons.length && buttonIndex < gp.buttons.length; buttonIndex++) {
                var key = map.buttons[buttonIndex];
                if (key) {
                    newStates[key] = !!newStates[key] || gp.buttons[buttonIndex].pressed;
                }
            }
            for (var axisIndex = 0; axisIndex < map.axes.length && axisIndex < gp.axes.length; axisIndex++) {
                var keyPair = map.axes[axisIndex];
                var key1 = keyPair && keyPair[0] || null;
                var key2 = keyPair && keyPair[1] || null;
                if (key1) {
                    newStates[key1] = !!newStates[key1] || gp.axes[axisIndex] <= -map.threshold;
                }
                if (key2) {
                    newStates[key2] = !!newStates[key2] || gp.axes[axisIndex] >= map.threshold;
                }
            }
        }
        for ( var key in newStates ) {
            if (newStates[key] != states[key]) {
                onKeyStateChanged.emit({ key: key, pressed: newStates[key] });
            }
        }
        states = newStates;

        requestAnimationFrame(pollGamepads);
    }

    this.get_onGamepadConnected = function() {
        return onGamepadConnected.pub;
    }
    this.get_onGamepadDisconnected = function () {
        return onGamepadDisconnected.pub;
    }
    this.get_onKeyStateChanged = function() {
        return onKeyStateChanged.pub;
    }
    this.setDeviceMap = function (index, map) {
        if (map) {
            var dev = devices.find(d => d.index === index);
            if (dev) {
                dev.map = map;
            }
            else {
                devices.push({
                    index: index,
                    map: map
                });
                if (devices.length === 1) {
                    pollGamepads();
                }
            }
        }
        else {
            var devIndex = devices.find(d => d.index === index);
            if (devIndex >= 0) {
                devices.splice(devIndex, 1);
            }
        }
    }
}
