function ZX_Mouse () {
	var buttons = 0x0f;
	var scrollPos = 0; // 0 - 15
	var x = 1; // 0 - 255
	var y = 2; // 0 - 255
	var listeners = [];
	
	function io_read(address) {
		if (address == 0xfadf)
			return ( scrollPos << 4 ) | buttons;
		if (address == 0xfbdf)
			return x;
		if (address == 0xffdf)
			return y;
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
		bus.on_io_read(io_read);
	}
}