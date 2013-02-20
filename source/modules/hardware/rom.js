function ZX_ROM() {
	'use strict';
	
	var memory = {};

	var roms = [
		{ key: 'sos', name: '48.rom' },
		{ key: 'turbo', name: '48turbo.rom' },
		{ key: 'sos128', name: '128tr.rom' },
		{ key: 'trdos', name: 'tr5_04t.rom' }
	];

	for (var i = 0; i < roms.length; i++) {
		get_rom(roms[i]);
	}

	function get_rom(rom) {
		ajax_get_text( 'get_base64.php?type=rom&name=' + rom.name, function(text) {
			memory[ rom.key ] = base64_decode(text);
			if ( memory[ rom.key ].length != 0x4000 ) {
				throw new Error('Wrong ROM ' + rom.key + ' size');
			}
		});
	}

	function ready() {
		return memory.sos && memory.turbo && memory.sos128 && memory.trdos;
	}

	var rom_trdos = false;
	var rom_turbo = false;
	var port_7ffd_value = 0x00;

	function read_byte(address) {
		if ( rom_trdos ) {
			return memory.trdos[ address ];
		}
		else if ( port_7ffd_value & 0x10 ) {
			return rom_turbo ? memory.turbo[ address ] : memory.sos[ address ];
		}
		else {
			return memory.sos128[ address ];
		}
	}	

	var device = new ZX_Device({
		id: 'rom',
		reset: function ( bus ) {
			bus.set_var('rom_trdos', rom_trdos);
			bus.set_var('rom_turbo', rom_turbo);
		},
		mreq: function ( state, bus ) {
			if ( state.m1 &&  ( state.address & 0xff00 ) == 0x3d00 && port_7ffd_value & 0x10 ) {
				bus.set_var('rom_trdos', true);
			}

			if ( state.address < 0x4000 && state.read ) {
				state.data = read_byte(state.address);
			}

			if ( state.m1 && ( state.address & 0xc000 )) {
				bus.set_var('rom_trdos', false);
			}
		},
		event: function ( name, options, bus ) {
			if ( name == 'var_changed' ) {
				switch ( options.name ) {
					case 'port_7ffd_value': port_7ffd_value = options.value; break;
					case 'rom_trdos': rom_trdos = options.value; break;
					case 'rom_turbo': rom_turbo = options.value; break;
				}
			}
		}
	});

	device.ready = ready;

	return device;
}