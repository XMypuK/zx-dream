function ZX_ROM() {
	"use strict";
	
	var ROM_SIZE = 0x4000;

	var _bus;
	var _memory = {};
	var _rom_trdos = false;
	var _rom_turbo = false;
	var _port_7ffd_value = 0x00;

	var roms = [
		{ key: 'sos', name: '48.rom' },
		{ key: 'turbo', name: '48turbo.rom' },
		{ key: 'sos128', name: '128tr.rom' },
		{ key: 'trdos', name: 'tr5_04t.rom' }
	];

	var ready$ = Promise.all([
		get_rom(roms[0]),
		get_rom(roms[1]),
		get_rom(roms[2]),
		get_rom(roms[3])
	]);

	function get_rom(rom) {
		return loadServerFile(rom.name).then(function (data) {
			if (data.length != ROM_SIZE)
				throw new Error('Wrong ROM ' + rom.key + ' size.');

			_memory[rom.key] = new Uint8Array(data);
		});
	}

	function readByte(address) {
		if (_rom_trdos) {
			return _memory.trdos[address];
		}
		else if (_port_7ffd_value & 0x10) {
			return _rom_turbo ? _memory.turbo[address] : _memory.sos[address];
		}
		else {
			return _memory.sos128[address];
		}
	}	

	function readInstruction(address) {
		var data;

		if (( address & 0xff00 ) == 0x3d00 && (_port_7ffd_value & 0x10) && !_rom_trdos) {
			_bus.var_write('rom_trdos', true);
		}

		if ( address < 0x4000 ) {
			// readByte(address) function is inlined for the sake of performance
			// readByte begin
			if (_rom_trdos) {
				data = _memory.trdos[address];
			}
			else if (_port_7ffd_value & 0x10) {
				data = _rom_turbo ? _memory.turbo[address] : _memory.sos[address];
			}
			else {
				data = _memory.sos128[address];
			}
			// readByte end
		}

		if (( address & 0xc000 ) && _rom_trdos) {
			_bus.var_write('rom_trdos', false);
		}

		return data;
	}

	function var_write_port_7ffd_value(name, value) {
		_port_7ffd_value = value;
	}

	function var_write_rom_trdos(name, value) {
		_rom_trdos = value;
	}

	function var_write_rom_turbo(name, value) {
		_rom_turbo = value;
	}

	function var_read_rom_trdos(name) {
		return _rom_trdos;
	}

	function var_read_rom_turbo(name) {
		return _rom_turbo;
	}

	function reset() {
		_bus.var_write('rom_trdos', false);
		_bus.var_write('rom_turbo', false);
	}

	this.get_ready$ = function () { 
		return ready$; 
	};

	this.connect = function(bus) {
		_bus = bus;
		bus.on_instruction_read(readInstruction);
		bus.on_mem_read(readByte, { range: { begin: 0x0000, end: 0x3FFF } });
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_var_write(var_write_rom_trdos, 'rom_trdos');
		bus.on_var_write(var_write_rom_turbo, 'rom_turbo');
		bus.on_var_read(var_read_rom_trdos, 'rom_trdos');
		bus.on_var_read(var_read_rom_turbo, 'rom_turbo');
		bus.on_reset(reset);
	}
}