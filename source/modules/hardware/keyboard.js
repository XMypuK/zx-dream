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

	function get_key_code(event) {
		var key_code = event.keyCode;
		switch (key_code) {
			case 186: key_code = 59; break; // ;
			case 187: key_code = 61; break; // =
			case 188: key_code = 44; break; // ,
			case 109: // не опечатка ли в таблице? - нет! :)
			case 189: key_code = 45; break; // -
			case 190: key_code = 46; break; // .
			case 191: key_code = 47; break; // /
			case 192: key_code = 96; break; // `
			case 219: key_code = 91; break; // [
			case 220: key_code = 92; break; // \
			case 221: key_code = 93; break; // ]
			case 222: key_code = 94; break; // '
		}
		return key_code;
	}

	function onkeydown(e) {
		var key_code = get_key_code(e || window.event);
		var keys = decode_keys(key_code);
		if ( keys.length ) {
			switch_keys(keys, true);
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

	function onkeyup(e) {
		var key_code = get_key_code(e || window.event);
		var keys = decode_keys(key_code);
		if ( keys.length ) {
			switch_keys(keys, false);
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

	var key_states = [ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff ];

	function decode_keys( key_code ) {
		var keys = [
			//{ index: 1, bit: 4 }
		];

		switch (key_code) {
			case 0x10: keys.push({ index: 0, bit: 0 }); break; // Shift (Caps Shift)
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
			case 0x11: keys.push({ index: 7, bit: 1 }); break; // Ctrl (Symbol Shift)
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

	function io_read(address) {
		if ((address & 0xff) == 0xfe) {
			var port_hi = address >> 8;
			var data = 0xff;
			for (var index = 0; index < 8; index++) {
				if ( !(port_hi & (0x01 << index)) ) {
					data &= key_states[index];
				}
			}
			return data;
		}
	}
	
	function connect(bus) {
		bus.on_io_read(io_read);
	}

	this.monitorKeyState = monitorKeyState;
	this.switchKeys = switch_keys;
	this.connect = connect;
}