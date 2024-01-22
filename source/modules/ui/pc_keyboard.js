function PCKeyboard() {
    'use strict';

    var _leftShiftPressed = false;
	var _rightShiftPressed = false;
	var _onKeysStateChanged = new ZXEvent();

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
				case 1: _leftShiftPressed = true; break;
				case 2: _rightShiftPressed = true; break;
			}
		}
		var keys = decodeKeys(keyId);
		if ( keys.length ) {
			_onKeysStateChanged.emit({
				keys: keys,
				pressed: true
			});
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

	function onkeyup(e) {
		var keyId = getKeyId(e || window.event);
		var keyId2 = null;
		if (keyId.code == 0x10) {
			_leftShiftPressed = false;
			_rightShiftPressed = false;
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
			_onKeysStateChanged.emit({
				keys: keys,
				pressed: false
			});
			e.preventDefault ? e.preventDefault() : (e.returnValue = false);
		}
	}

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

			case 0x2C: 
				if (_rightShiftPressed) {
					// < (Symbol Shift + R)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 2, bit: 3 });
				}
				else {
					// , (Symbol Shift + N)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 7, bit: 3 });
				}
				break;

			case 0x2D:
				if (_rightShiftPressed) {
					// _ (Symbol Shift + 0)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 4, bit: 0 });
				}
				else {
					// - (Symbol Shift + J)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 6, bit: 3 });
				}
				break;

			case 0x2E:
				if (_rightShiftPressed) {
					// > (Symbol Shift + T)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 2, bit: 4 });
				}
				else {
					// . (Symbol Shift + M)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 7, bit: 2 });
				}
				break;
			
			case 0x2F:
				if (_rightShiftPressed) {
					// ? (Symbol Shift + C)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 0, bit: 3 });
				}
				else {
					// / (Symbol Shift + V)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 0, bit: 4 });
				}
				break;

			case 0x3B:
				if (_rightShiftPressed) {
					// : (Symbol Shift + Z)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 0, bit: 1 }); 
				}
				else {
					// ; (Symbol Shift + O)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 5, bit: 1 });
				}
				break;

			case 0x3D:
				if (_rightShiftPressed) {
					// + (Symbol Shift + K)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 6, bit: 2 });
				}
				else {
					// = (Symbol Shift + L)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 6, bit: 1 });
				}
				break;

			case 0x5E:
				if (_rightShiftPressed) {
					// " (Symbol Shift + P)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 5, bit: 0 });
				}
				else {
					// ' (Symbol Shift + 7)
					keys.push({ index: 7, bit: 1 });
					keys.push({ index: 4, bit: 3 });
				}
				break;

			case 0x60: keys.push({ index: 4, bit: 0 }); break; // 0
			case 0x61: keys.push({ index: 3, bit: 0 }); break; // 1
			case 0x62: keys.push({ index: 3, bit: 1 }); break; // 2
			case 0x63: keys.push({ index: 3, bit: 2 }); break; // 3
			case 0x64: keys.push({ index: 3, bit: 3 }); break; // 4
			case 0x65: keys.push({ index: 3, bit: 4 }); break; // 5
			case 0x66: keys.push({ index: 4, bit: 4 }); break; // 6
			case 0x67: keys.push({ index: 4, bit: 3 }); break; // 7
			case 0x68: keys.push({ index: 4, bit: 2 }); break; // 8
			case 0x69: keys.push({ index: 4, bit: 1 }); break; // 9

			case 0x6A:
				// * (Symbol Shift + B)
				keys.push({ index: 7, bit: 1 });
				keys.push({ index: 7, bit: 4 });
				break;

			case 0x6B:
				// + (Symbol Shift + K)
				keys.push({ index: 7, bit: 1 });
				keys.push({ index: 6, bit: 2 });
				break;

			case 0x6E:
				// , (Symbol Shift + N)
				keys.push({ index: 7, bit: 1 });
				keys.push({ index: 7, bit: 3 });
				break;

			case 0x6F:
				// / (Symbol Shift + V)
				keys.push({ index: 7, bit: 1 });
				keys.push({ index: 0, bit: 4 });
				break;
				
		}

		return keys;
	}

	this.get_onKeysStateChanged = function () {
		return _onKeysStateChanged.pub;
	}
}
