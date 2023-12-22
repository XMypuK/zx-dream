function ZX_ROM() {
	'use strict';
	
	var ROM_SIZE = 0x4000;

	var _bus;
	var memory = {};
	var useTypedArrays = isTypedArraysSupported();

	var roms = [
		{ key: 'sos', name: '48.rom' },
		{ key: 'turbo', name: '48turbo.rom' },
		{ key: 'sos128', name: '128tr.rom' },
		{ key: 'trdos', name: 'tr5_04t.rom' }
	];

	var ready$ = $.when(
		get_rom(roms[0]),
		get_rom(roms[1]),
		get_rom(roms[2]),
		get_rom(roms[3])
	);

	function get_rom(rom) {
		return loadServerFile(rom.name).then(function (data) {
			if (data.length != ROM_SIZE)
				throw new Error('Wrong ROM ' + rom.key + ' size.');

			if (useTypedArrays) {
				memory[rom.key] = new Uint8Array(data);
			}
			else {
				memory[rom.key] = data;
			}
		});
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

	function read_instruction(address) {
		var data;

		if (( address & 0xff00 ) == 0x3d00 && port_7ffd_value & 0x10) {
			_bus.var_write('rom_trdos', true);
		}

		if ( address < 0x4000 ) {
			data = read_byte(address);
		}

		if ( address & 0xc000 ) {
			_bus.var_write('rom_trdos', false);
		}

		return data;
	}

	function read(address) {
		return read_byte(address);
	}

	function var_write_port_7ffd_value(name, value) {
		port_7ffd_value = value;
	}

	function var_write_rom_trdos(name, value) {
		rom_trdos = value;
	}

	function var_write_rom_turbo(name, value) {
		rom_turbo = value;
	}

	function var_read_rom_trdos(name) {
		return rom_trdos;
	}

	function var_read_rom_turbo(name) {
		return rom_turbo;
	}

	function reset() {
		_bus.var_write('rom_trdos', false);
		_bus.var_write('rom_turbo', false);
	}

	function opt_useTypedArrays(name, value) {
		if (useTypedArrays != value) {
			useTypedArrays = value;

			if (useTypedArrays) {
				for (var key in memory) {
					if (memory[key]) {
						memory[key] = new Uint8Array(memory[key]);
					}
				}
			}
			else {
				for (var key in memory) {
					if (memory[key]) {
						memory[key] = Array.prototype.slice.call(memory[key]);
					}
				}
			}
		}
	}

	this.get_ready$ = function () { 
		return ready$; 
	};

	this.connect = function(bus) {
		_bus = bus;
		bus.on_instruction_read(read_instruction);
		bus.on_mem_read(read, { range: { begin: 0x0000, end: 0x3FFF } });
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_var_write(var_write_rom_trdos, 'rom_trdos');
		bus.on_var_write(var_write_rom_turbo, 'rom_turbo');
		bus.on_var_read(var_read_rom_trdos, 'rom_trdos');
		bus.on_var_read(var_read_rom_turbo, 'rom_turbo');
		bus.on_reset(reset);
		bus.on_opt(opt_useTypedArrays, OPT_USE_TYPED_ARRAYS);
	}
}