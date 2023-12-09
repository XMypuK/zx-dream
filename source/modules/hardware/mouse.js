function ZX_Mouse () {
	var _bus;
	var buttons = 0x0F;
	var scrollPos = 0x0F; // 0 - 15
	var x = 1; // 0 - 255
	var y = 2; // 0 - 255
	var listeners = [];
	
	function io_read(address) {
		// Kempston Mouse Interface Ports are:
		//   FADF: buttons + scroll
		//   FBDF: x
		//   FFDF: y
		//   FEDF: last value of port 7FFD (in some implemetations)
		// Ports are usually decoded by the next address lines:
		//   A10, A8: variable
		//   A5: 0
		//   A7: 1
		//	 A0, A9: 1 (in some implementations, but not here *)
		//   * found the next behaviour:
		//	   if check A0 and A9 then mouse is detected in ZX-Format #8, but not in Deja Vu #8;
		//     if check A0 and not A9 then mouse is deteced in Deja Vu #8, but not in ZX-Format #8;
		//	   if don't check A0 (whatever A9 is) then mouse is deteced in both both Deja Vu #8 and ZX-Format #8.
		switch (address & 0x05A0) {
			case 0x0080: return ( scrollPos << 4 ) | buttons;
			case 0x0180: return x;
			case 0x0580: return y;
			case 0x0480: return _bus.var_read('port_7ffd_value');
		}
	}

	function notifyListeners( state ) {
		for ( var i = 0; i < listeners.length; i++ ) {
			listeners[i](state);
		}
	}	

	this.switchButton = function ( num, pressed ) {
		var idx = num - 1;
		var cur = (buttons & (1 << idx)) ? 1 : 0;
		var value = pressed ? 0 : 1;
		if (cur == value)
			return;
		if (value)
			buttons |= (1 << idx) & 0x0f;
		else
			buttons &= ~(1 << idx) & 0x0f;
		notifyListeners({ type: 'key', num: num, pressed: !!pressed });
	}

	this.wheel = function (diff) {
		scrollPos = (scrollPos + diff) & 0x0f;
		notifyListeners({ type: 'wheel', diff: diff });
	}

	this.moveX = function (diff) {
		x = ( x + diff ) & 0xff;
		notifyListeners({ type: 'move-x', diff: diff });
	}

	this.moveY = function (diff) {
		y = ( y + diff ) & 0xff;
		notifyListeners({ type: 'move-y', diff: diff });
	}

	this.subscribe = function ( listener ) {
		if ( typeof listener == 'function' ) {
			listeners.push(listener);
		}
	}

	this.connect = function (bus) {
		_bus = bus;
		bus.on_io_read(io_read);
	}
}