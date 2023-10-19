function ZX_Bus() {
	'use strict';

	var instruction_read_handlers = [];
	var mem_read_handlers = [];
	var mem_write_handlers = [];
	var io_read_handlers = [];
	var io_write_handlers = [];
	var var_read_handlers = [];
	var var_write_handlers = [];
	var specific_var_read_handlers = {};
	var specific_var_write_handlers = {};
	var reset_handlers = [];
	var opt_handlers = [];
	var specific_opt_handlers = [];

	function register_handler(collection, fn) {
		if (typeof fn === 'function') {
			collection.push(fn);
		}
	}

	function on_instruction_read(fn) {
		register_handler(instruction_read_handlers, fn);
	}

	function on_mem_read(fn) {
		register_handler(mem_read_handlers, fn);
	}

	function on_mem_write(fn) {
		register_handler(mem_write_handlers, fn);
	}

	function on_io_read(fn) {
		register_handler(io_read_handlers, fn);
	}

	function on_io_write(fn) {
		register_handler(io_write_handlers, fn);
	}

	function on_var_read(fn, name) {
		var handlers = var_read_handlers;
		if (!!name) {
			handlers = specific_var_read_handlers[name] || (specific_var_read_handlers[name] = []);
		}
		register_handler(handlers, fn);
	}

	function on_var_write(fn, name) {
		var handlers = var_write_handlers;
		if (!!name) {
			handlers = specific_var_write_handlers[name] || (specific_var_write_handlers[name] = []);
		}
		register_handler(handlers, fn);
	}

	function on_reset(fn) {
		register_handler(reset_handlers, fn);
	}

	function on_opt(fn, name) {
		var handlers = opt_handlers;
		if (!!name) {
			handlers = specific_opt_handlers[name] || (specific_opt_handlers[name] = []);
		}
		register_handler(handlers, fn);
	}

	function instruction_read(address) {
		var result;
		for ( var i = 0; i < instruction_read_handlers.length; i++ ) {
			var subresult = instruction_read_handlers[i](address);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		return result;
	}

	function mem_read(address) {
		var result = 0xff;
		for ( var i = 0; i < mem_read_handlers.length; i++ ) {
			var subresult = mem_read_handlers[i](address);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		return result;
	}

	function mem_write(address, data) {
		for ( var i = 0; i < mem_write_handlers.length; i++ ) {
			mem_write_handlers[i](address, data);
		}
	}

	function io_read(address) {
		var result = 0xff;
		for ( var i = 0; i < io_read_handlers.length; i++ ) {
			var subresult = io_read_handlers[i](address);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		return result;
	}

	function io_write(address, data) {
		for ( var i = 0; i < io_write_handlers.length; i++ ) {
			io_write_handlers[i](address, data);
		}
	}

	function var_read(name) {
		var result;
		var specific_handlers = specific_var_read_handlers[name] || [];
		for ( var i = 0; i < specific_handlers.length; i++ ) {
			var subresult = specific_handlers[i](name);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		for ( var i = 0; i < var_read_handlers.length; i++ ) {
			var subresult = var_read_handlers[i](name);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		return result;
	}

	function var_write(name, value) {
		var specific_handlers = specific_var_write_handlers[name] || [];
		for ( var i = 0; i < specific_handlers.length; i++ ) {
			specific_handlers[i](name, value);
		}
		for ( var i = 0; i < var_write_handlers.length; i++ ) {
			var_write_handlers[i](name, value);
		}
	}

	function reset() {
		for ( var i = 0; i < reset_handlers.length; i++ ) {
			reset_handlers[i]();
		}
	}

	function opt(name, value) {
		var specific_handlers = specific_opt_handlers[name] || [];
		for ( var i = 0; i < specific_handlers.length; i++ ) {
			specific_handlers[i](name, value);
		}
		for ( var i = 0; i < opt_handlers.length; i++ ) {
			opt_handlers[i](name, value);
		}
	}

	this.on_instruction_read = on_instruction_read;
	this.on_mem_read = on_mem_read;
	this.on_mem_write = on_mem_write;
	this.on_io_read = on_io_read;
	this.on_io_write = on_io_write;
	this.on_var_read = on_var_read;
	this.on_var_write = on_var_write;
	this.on_reset = on_reset;
	this.on_opt = on_opt;
	this.instruction_read = instruction_read;
	this.mem_read = mem_read;
	this.mem_write = mem_write;
	this.var_read = var_read;
	this.var_write = var_write;
	this.io_read = io_read;
	this.io_write = io_write;
	this.reset = reset;
	this.opt = opt;
}
