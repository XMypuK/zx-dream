function ZX_Keyboard() {
	"use strict";
	
	var _keyStates = [ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff ];
	var _onKeysStateChanged = new ZX_Event();

	function switchKeys(keys, pressed) {
		for ( var i = 0; i < keys.length; i++ ) {
			if ( pressed ) {
				_keyStates[keys[i].index] &= ((0x01 << keys[i].bit) ^ 0xff);
			}
			else {
				_keyStates[keys[i].index] |= (0x01 << keys[i].bit);
			}
		}

		_onKeysStateChanged.emit({
			keys: keys,
			pressed: pressed
		});
	}


	function io_read_fe(address) {
		var data = 0xFF;
		!(address & 0x0100) && (data &= _keyStates[0]);
		!(address & 0x0200) && (data &= _keyStates[1]);
		!(address & 0x0400) && (data &= _keyStates[2]);
		!(address & 0x0800) && (data &= _keyStates[3]);
		!(address & 0x1000) && (data &= _keyStates[4]);
		!(address & 0x2000) && (data &= _keyStates[5]);
		!(address & 0x4000) && (data &= _keyStates[6]);
		!(address & 0x8000) && (data &= _keyStates[7]);
		return data;
	}
	
	function connect(bus) {
		bus.on_io_read(io_read_fe, { mask: 0xFF, value: 0xFE });
	}

	this.get_onKeysStateChanged = function () {
		return _onKeysStateChanged.pub;
	}
	this.switchKeys = switchKeys;
	this.connect = connect;
}
