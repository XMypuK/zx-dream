function ZX_RAM() {
	"use strict";

	var PAGE_SIZE = 0x4000;
	var PAGE_COUNT = 32;
	
	var _bus;
	var _memory = null;
	var _extendedMemory = VAL_EXTENDED_MEMORY_OFF;
	var _port_7ffd_value = 0x00;

	// инициализация памяти 512 кб
	initMemory();

	function initMemory() {
		_memory = [];
		var buffer = new ArrayBuffer(PAGE_SIZE * PAGE_COUNT);
		for ( var page = 0; page < PAGE_COUNT; page++ ) {
			_memory[page] = new Uint8Array(buffer, page * PAGE_SIZE, PAGE_SIZE);
		}
	}

	function readByte(address) {
		if (address >= 0x4000 && address < 0x8000) {
			return _memory[5][address & 0x3FFF];
		}
		if (address >= 0x8000 && address < 0xC000) {
			return _memory[2][address & 0x3FFF];
		}
		if (address >= 0xC000) {
			var page = (_extendedMemory == VAL_EXTENDED_MEMORY_PENTAGON)
				? (( _port_7ffd_value & 0xc0 ) >> 3 ) | ( _port_7ffd_value & 0x07 )
				: ( _port_7ffd_value & 0x07 );
			return _memory[page][address & 0x3FFF];
		}
	}

	function writeByte(address, data) {
		if (address >= 0x4000 && address < 0x8000) {
			_memory[5][address & 0x3FFF] = data;
		}
		else if (address >= 0x8000 && address < 0xC000) {
			_memory[2][address & 0x3FFF] = data;
		}
		else if (address >= 0xC000) {
			var page = (_extendedMemory == VAL_EXTENDED_MEMORY_PENTAGON)
				? (( _port_7ffd_value & 0xc0 ) >> 3 ) | ( _port_7ffd_value & 0x07 )
				: ( _port_7ffd_value & 0x07 );
			_memory[page][address & 0x3FFF] = data;
		}
	}

	function var_write_port_7ffd_value(name, value) {
		_port_7ffd_value = value;
	}

	function opt_extendedMemory(name, value) {
		_extendedMemory = value;
	}

	this.connect = function(bus) {
		_bus = bus;
		bus.on_instruction_read(readByte, { range: { begin: 0x4000, end: 0xFFFF } });
		bus.on_mem_read(readByte, { range: { begin: 0x4000, end: 0xFFFF } });
		bus.on_mem_write(writeByte, { range: { begin: 0x4000, end: 0xFFFF } });
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_opt(opt_extendedMemory, OPT_EXTENDED_MEMORY);
	}
}