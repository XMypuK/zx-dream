function ZX_Mouse () {
	var b1 = 1;
	var b2 = 1;
	var b3 = 1;
	var b4 = 1;
	var scroll_pos = 0; // 0 - 15
	var x_pos = 1; // 0 - 255
	var y_pos = 2; // 0 - 255
	var monitors = [];
	
	var device = new ZX_Device({
		id: 'mouse',
		iorq: function ( state, bus ) {
			if ( state.read ) {
				switch ( state.address ) {
					// кнопки
					case 0xfadf:
						state.data = ( scroll_pos << 4 ) | ( b4 << 3 ) | ( b3 << 2 ) | ( b2 << 1 ) | b1;
						break;

					// x
					case 0xfbdf:
						state.data = x_pos;
						break;

					// y
					case 0xffdf:
						state.data = y_pos;
						break;
				}
			}
		}
	});

	function notify_monitors( state ) {
		for ( var i = 0; i < monitors.length; i++ ) {
			monitors[i](state);
		}
	}	

	device.switch_button = function ( num, pressed ) {
		switch ( num ) {
			case 1: b1 = pressed ? 0 : 1; break;
			case 2: b2 = pressed ? 0 : 1; break;
			case 3: b3 = pressed ? 0 : 1; break;
			case 4: b4 = pressed ? 0 : 1; break;
		}
		notify_monitors({ type: 'key', num: num, pressed: pressed });
	}

	device.wheel_up = function ( diff ) {
		scroll_pos = ( scroll_pos + diff ) & 0x0f;
		notify_monitors({ type: 'wheel', diff: diff });
	}

	device.wheel_down = function ( diff ) {
		scroll_pos = ( scroll_pos - diff ) & 0x0f;
		notify_monitors({ type: 'wheel', diff: -diff });
	}

	device.move_up = function ( diff ) {
		y_pos = ( y_pos + diff ) & 0xff;
		notify_monitors({ type: 'vmove', diff: diff });
	}

	device.move_down = function ( diff ) {
		y_pos = ( y_pos - diff ) & 0xff;
		notify_monitors({ type: 'vmove', diff: -diff });
	}

	device.move_left = function ( diff ) {
		x_pos = ( x_pos - diff ) & 0xff;
		notify_monitors({ type: 'hmove', diff: -diff });
	}

	device.move_right = function ( diff ) {
		x_pos = ( x_pos + diff ) & 0xff;
		notify_monitors({ type: 'hmove', diff: diff });
	}

	device.monitor = function ( listener ) {
		if ( typeof listener == 'function' ) {
			monitors.push(listener);
		}
	}

	return device;
}