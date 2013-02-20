function ZX_RAM() {
	'use strict';
	
	var MODE_OFF = 0;
	var MODE_PENTRAGON = 1;

	var mode = MODE_OFF;

	var port_7ffd_value = 0x00;

	// инициализация памяти 512 кб
	var memory = [];
	for ( var page = 0; page < 32; page++ ) {
		var memory_page = [];

		for ( var address = 0x0000; address < 0x4000; address++ ) {
			memory_page[address] = 0x00;
		}

		memory[page] = memory_page;
	}

	function get_page( address ) {
		if ( address < 0x4000 ) {
			return NaN;
		}

		if ( address < 0x8000 ) {
			return 5;
		}

		if ( address < 0xc000 ) {
			return 2;
		}

		switch ( mode ) {
			case MODE_OFF: return ( port_7ffd_value & 0x07 );
			case MODE_PENTRAGON: return (( port_7ffd_value & 0xc0 ) >> 3 ) | ( port_7ffd_value & 0x07 );
		}

		return NaN;
	}

	var device = new ZX_Device({
		id: 'ram',
		reset: function ( bus ) {

		},
		dreq: function ( state, bus ) {
			if ( state.dreq == 'ram_read' ) {
				state.data = memory[state.page][state.address];
			}
		},
		mreq: function ( state, bus ) {
			var page = get_page(state.address);
			var address = state.address & 0x3fff;

			if ( isNaN(page) ) {
				return;
			}

			if ( state.write ) {
				memory[page][address] = state.data;

				if ( address < 0x1b00 ) {
					switch ( page ) {
						case 5: bus.raise('wr_scr_5', { address: address, data: state.data }); break;
						case 7: bus.raise('wr_scr_7', { address: address, data: state.data }); break;
					}
				}

				return;
			}

			if ( state.read ) {
				state.data = memory[page][address];
				return;
			}		
		},
		event: function ( name, options, bus ) {
			if ( name == 'var_changed' && options.name == 'port_7ffd_value' ) {
				port_7ffd_value = options.value;
			}
		}
	});

	device.mode = function(value) {
		if ( value !== undefined ) {
			mode = value;
		}
		else {
			return mode;
		}
	}

	return device;
}