function ZX_RAM() {
	'use strict';
	
	var _bus;
	var PAGE_SIZE = 0x4000;
	var PAGE_COUNT = 32;

	var extendedMemory = VAL_EXTENDED_MEMORY_OFF;
	var port_7ffd_value = 0x00;
	var useTypedArrays = isTypedArraysSupported();

	// инициализация памяти 512 кб
	var ordinaryPages = null;
	var typedPages = null;
	var memory = null;
	
	if (useTypedArrays) {
		initTypedPages();
		memory = typedPages;
	}
	else {
		initOrdinaryPages();
		memory = ordinaryPages;
	}

	function initOrdinaryPages() {
		ordinaryPages = [];
		for ( var page = 0; page < PAGE_COUNT; page++ ) {
			var pageData = [];
			for ( var address = 0x0000; address < PAGE_SIZE; address++ ) {
				pageData[address] = 0x00;
			}
			ordinaryPages[page] = pageData;
		}
	}

	function initTypedPages() {
		typedPages = [];
		var buffer = new ArrayBuffer(PAGE_SIZE * PAGE_COUNT);
		for ( var page = 0; page < PAGE_COUNT; page++ ) {
			typedPages[page] = new Uint8Array(buffer, page * PAGE_SIZE, PAGE_SIZE);
		}
	}

	function switchToOrdinaryPages() {
		if (!ordinaryPages) {
			initOrdinaryPages();
		}
		for ( var page = 0; page < PAGE_COUNT; page++ ) {
			ordinaryPages[page] = Array.prototype.slice.call(typedPages[page]);
		}
		memory = ordinaryPages;
	}

	function switchToTypedPages() {
		if (!typedPages) {
			initTypedPages();
		}
		for ( var page = 0; page < PAGE_COUNT; page++ ) {
			typedPages[page].set(ordinaryPages[page]);
		}
		memory = typedPages;
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

		switch ( extendedMemory ) {
			case VAL_EXTENDED_MEMORY_OFF: return ( port_7ffd_value & 0x07 );
			case VAL_EXTENDED_MEMORY_PENTAGON: return (( port_7ffd_value & 0xc0 ) >> 3 ) | ( port_7ffd_value & 0x07 );
		}

		return NaN;
	}

	function read( address ) {
		var page = get_page(address);
		if ( !isNaN(page) ) {
			return memory[page][address & 0x3fff];
		}
	}

	function write( address, data ) {
		var page = get_page(address);
		if ( !isNaN(page) ) {
			memory[page][address & 0x3fff] = data;
		}
	}

	function var_write_port_7ffd_value(name, value) {
		port_7ffd_value = value;
	}

	function opt_extendedMemory(name, value) {
		if (extendedMemory !== value) {
			extendedMemory = value;
		}
	}

	function opt_useTypedArrays(name, value) {
		if (useTypedArrays != value) {
			useTypedArrays = value;
			if (useTypedArrays) {
				switchToTypedPages();
			}
			else {
				switchToOrdinaryPages();
			}
		}
	}

	this.connect = function(bus) {
		_bus = bus;
		bus.on_instruction_read(read);
		bus.on_mem_read(read);
		bus.on_mem_write(write);
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_opt(opt_extendedMemory, OPT_EXTENDED_MEMORY);
		bus.on_opt(opt_useTypedArrays, OPT_USE_TYPED_ARRAYS);
	}
}