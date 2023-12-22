function ZX_Keyboard() {
	'use strict';

	if (document.addEventListener) {
		document.addEventListener('keydown', onkeydown, false);
		document.addEventListener('keyup', onkeyup, false)
	}
	else {
		document.attachEvent('onkeydown', onkeydown);
		document.attachEvent('onkeyup', onkeyup);
	}

	function getKeyId(event) {
		var code = event.keyCode;
		switch (code) {
			case 186: code = 59; break; // ;
			case 187: code = 61; break; // =
			case 188: code = 44; break; // ,
			case 109: // не опечатка ли в таблице? - нет! :)
			case 189: code = 45; break; // -
			case 190: code = 46; break; // .
			case 191: code = 47; break; // /
			case 192: code = 96; break; // `
			case 219: code = 91; break; // [
			case 220: code = 92; break; // \
			case 221: code = 93; break; // ]
			case 222: code = 94; break; // '
		}
		return {
			code: code,
			location: event.location
		}
	}

	function onkeydown(e) {
		var keyId = getKeyId(e || window.event);
		if (keyId.code == 0x10) {
			switch (keyId.location) {
				case 1: leftShiftPressed = true; break;
				case 2: rightShiftPressed = true; break;
			}
		}
		var keys = decodeKeys(keyId);
		if ( keys.length ) {
			switch_keys(keys, true);
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

	function onkeyup(e) {
		var keyId = getKeyId(e || window.event);
		var keyId2 = null;
		if (keyId.code == 0x10) {
			leftShiftPressed = false;
			rightShiftPressed = false;
			switch (keyId.location) {
				case 1: keyId2 = { code: 0x10, location: 2 }; break;
				case 2: keyId2 = { code: 0x10, location: 1 }; break;
			}
		}
		var keys = decodeKeys(keyId);
		if (keyId2) {
			keys = keys.concat(decodeKeys(keyId2));
		}
		if ( keys.length ) {
			switch_keys(keys, false);
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

	var key_states = [ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff ];
	var leftShiftPressed = false;
	var rightShiftPressed = false;

	function decodeKeys( keyId ) {
		var keys = [
			//{ index: 1, bit: 4 }
		];

		switch (keyId.code) {
			case 0x10: 
				if (keyId.location == 0 || keyId.location == 1)
					keys.push({ index: 0, bit: 0 }); // Shift (Caps Shift)
				else if (keyId.location == 2)
					keys.push({ index: 7, bit: 1 }); // Ctrl (Symbol Shift)
				break;
			case 0x5a: keys.push({ index: 0, bit: 1 }); break; // Z
			case 0x58: keys.push({ index: 0, bit: 2 }); break; // X
			case 0x43: keys.push({ index: 0, bit: 3 }); break; // C
			case 0x56: keys.push({ index: 0, bit: 4 }); break; // V

			case 0x41: keys.push({ index: 1, bit: 0 }); break; // A
			case 0x53: keys.push({ index: 1, bit: 1 }); break; // S
			case 0x44: keys.push({ index: 1, bit: 2 }); break; // D
			case 0x46: keys.push({ index: 1, bit: 3 }); break; // F
			case 0x47: keys.push({ index: 1, bit: 4 }); break; // G

			case 0x51: keys.push({ index: 2, bit: 0 }); break; // Q
			case 0x57: keys.push({ index: 2, bit: 1 }); break; // W
			case 0x45: keys.push({ index: 2, bit: 2 }); break; // E
			case 0x52: keys.push({ index: 2, bit: 3 }); break; // R
			case 0x54: keys.push({ index: 2, bit: 4 }); break; // T

			case 0x31: keys.push({ index: 3, bit: 0 }); break; // 1
			case 0x32: keys.push({ index: 3, bit: 1 }); break; // 2
			case 0x33: keys.push({ index: 3, bit: 2 }); break; // 3
			case 0x34: keys.push({ index: 3, bit: 3 }); break; // 4
			case 0x35: keys.push({ index: 3, bit: 4 }); break; // 5

			case 0x30: keys.push({ index: 4, bit: 0 }); break; // 0
			case 0x39: keys.push({ index: 4, bit: 1 }); break; // 9
			case 0x38: keys.push({ index: 4, bit: 2 }); break; // 8
			case 0x37: keys.push({ index: 4, bit: 3 }); break; // 7
			case 0x36: keys.push({ index: 4, bit: 4 }); break; // 6

			case 0x50: keys.push({ index: 5, bit: 0 }); break; // P
			case 0x4f: keys.push({ index: 5, bit: 1 }); break; // O
			case 0x49: keys.push({ index: 5, bit: 2 }); break; // I
			case 0x55: keys.push({ index: 5, bit: 3 }); break; // U
			case 0x59: keys.push({ index: 5, bit: 4 }); break; // Y

			case 0x0d: keys.push({ index: 6, bit: 0 }); break; // Enter
			case 0x4c: keys.push({ index: 6, bit: 1 }); break; // L
			case 0x4b: keys.push({ index: 6, bit: 2 }); break; // K
			case 0x4a: keys.push({ index: 6, bit: 3 }); break; // J
			case 0x48: keys.push({ index: 6, bit: 4 }); break; // H

			case 0x20: keys.push({ index: 7, bit: 0 }); break; // Space
			case 0x11: 
				if (keyId.location == 0 || keyId.location == 1)
					keys.push({ index: 7, bit: 1 }); // Ctrl (Symbol Shift)
				else if (keyId.location == 2)
					keys.push({ index: 0, bit: 0 }); // Shift (Caps Shift)
				break;
			case 0x4d: keys.push({ index: 7, bit: 2 }); break; // M
			case 0x4e: keys.push({ index: 7, bit: 3 }); break; // N
			case 0x42: keys.push({ index: 7, bit: 4 }); break; // B

			// расширение для более удобной работы
			case 0x08: // Backspace (Caps Shift + 0)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 4, bit: 0 });
				break;

			case 0x14: // Caps Lock (Caps Shift + 2)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 3, bit: 1 });
				break;

			case 0x25: // Left (Caps Shift + 5)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 3, bit: 4 });
				break;

			case 0x26: // Up (Caps Shift + 7)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 4, bit: 3 });
				break;

			case 0x27: // Right (Caps Shift + 8)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 4, bit: 2 });
				break;

			case 0x28: // Down (Caps Shift + 6)
				keys.push({ index: 0, bit: 0 });
				keys.push({ index: 4, bit: 4 });
				break;
		}

		return keys;
	}

	function switch_keys( keys, pressed ) {
		for ( var i = 0; i < keys.length; i++ ) {
			if ( pressed ) {
				key_states[keys[i].index] &= ((0x01 << keys[i].bit) ^ 0xff);
			}
			else {
				key_states[keys[i].index] |= (0x01 << keys[i].bit);
			}
		}

		notifyListeners(keys, pressed);
	}

	var keyStateListeners = [];
	function monitorKeyState ( listener ) {
		keyStateListeners.push(listener);
	}
	function notifyListeners ( keys, pressed ) {
		for ( var i = 0; i < keyStateListeners.length; i++ ) {
			keyStateListeners[i](keys, pressed);
		}
	}

	function io_read_fe(address) {
		var data = 0xFF;
		!(address & 0x0100) && (data &= key_states[0]);
		!(address & 0x0200) && (data &= key_states[1]);
		!(address & 0x0400) && (data &= key_states[2]);
		!(address & 0x0800) && (data &= key_states[3]);
		!(address & 0x1000) && (data &= key_states[4]);
		!(address & 0x2000) && (data &= key_states[5]);
		!(address & 0x4000) && (data &= key_states[6]);
		!(address & 0x8000) && (data &= key_states[7]);
		return data;
	}
	
	function connect(bus) {
		bus.on_io_read(io_read_fe, { mask: 0xFF, value: 0xFE });
	}

	this.monitorKeyState = monitorKeyState;
	this.switchKeys = switch_keys;
	this.connect = connect;
}