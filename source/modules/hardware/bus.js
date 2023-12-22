function ZX_Bus() {
	'use strict';

	var instruction_read_handlers = [];
	var memReadHandlers = [];
	var memWriteHandlers = [];
	var ioReadHandlers = [];
	var ioWriteHandlers = [];
	var varReadHandlers = [];
	var varWriteHandlers = [];
	var namedVarReadHandlers = {};
	var namedVarWriteHandlers = {};
	var resetHandlers = [];
	var optHandlers = [];
	var namedOptHandlers = [];

	function registerHandler(collection, fn) {
		collection.push(fn);
	}

	function onInstructionRead(fn, filter) {
		registerHandler(instruction_read_handlers, { fn: fn, filter: filter });
	}

	function onMemRead(fn, filter) {
		registerHandler(memReadHandlers, { fn: fn, filter: filter });
	}

	function onMemWrite(fn, filter) {
		registerHandler(memWriteHandlers, { fn: fn, filter: filter });
	}

	function onIoRead(fn, filter) {
		registerHandler(ioReadHandlers, { fn: fn, filter: filter });
	}

	function onIoWrite(fn, filter) {
		registerHandler(ioWriteHandlers, { fn: fn, filter: filter });
	}

	function onVarRead(fn, name) {
		var handlers = varReadHandlers;
		if (!!name) {
			handlers = namedVarReadHandlers[name] || (namedVarReadHandlers[name] = []);
		}
		registerHandler(handlers, fn);
	}

	function onVarWrite(fn, name) {
		var handlers = varWriteHandlers;
		if (!!name) {
			handlers = namedVarWriteHandlers[name] || (namedVarWriteHandlers[name] = []);
		}
		registerHandler(handlers, fn);
	}

	function onReset(fn) {
		registerHandler(resetHandlers, fn);
	}

	function onOpt(fn, name) {
		var handlers = optHandlers;
		if (!!name) {
			handlers = namedOptHandlers[name] || (namedOptHandlers[name] = []);
		}
		registerHandler(handlers, fn);
	}

	function instructionRead(address) {
		var result;
		for ( var i = 0; i < instruction_read_handlers.length; i++ ) {
			var hndInfo = instruction_read_handlers[i];
			var process = !hndInfo.filter
				|| hndInfo.filter.range && hndInfo.filter.range.begin <= address && address <= hndInfo.filter.range.end
				|| (hndInfo.filter.mask !== undefined) && (address & hndInfo.filter.mask) == hndInfo.filter.value;
			if (process) {
				var subresult = hndInfo.fn(address);
				if (subresult !== undefined) {
					result = subresult;
				}
			}
		}
		return result;
	}

	function memRead(address) {
		var result = 0xff;
		for ( var i = 0; i < memReadHandlers.length; i++ ) {
			var hndInfo = memReadHandlers[i];
			var process = !hndInfo.filter
				|| hndInfo.filter.range && hndInfo.filter.range.begin <= address && address <= hndInfo.filter.range.end
				|| (hndInfo.filter.mask !== undefined) && (address & hndInfo.filter.mask) == hndInfo.filter.value;
			if (process) {
				var subresult = hndInfo.fn(address);
				if (subresult !== undefined) {
					result = subresult;
				}
			}
		}
		return result;
	}

	function memWrite(address, data) {
		for ( var i = 0; i < memWriteHandlers.length; i++ ) {
			var hndInfo = memWriteHandlers[i];
			var process = !hndInfo.filter
				|| hndInfo.filter.range && hndInfo.filter.range.begin <= address && address <= hndInfo.filter.range.end
				|| (hndInfo.filter.mask !== undefined) && (address & hndInfo.filter.mask) == hndInfo.filter.value;
			if (process) {
				hndInfo.fn(address, data);
			}
		}
	}

	function ioRead(address) {
		var result = 0xFF;
		for ( var i = 0; i < ioReadHandlers.length; i++ ) {
			var hndInfo = ioReadHandlers[i];
			var process = !hndInfo.filter
				|| (hndInfo.filter.mask !== undefined) && (address & hndInfo.filter.mask) == hndInfo.filter.value
				|| hndInfo.filter.range && hndInfo.filter.range.begin <= address && address <= hndInfo.filter.range.end;
			if (process) {
				var subresult = hndInfo.fn(address);
				if (subresult !== undefined) {
					result &= subresult;
				}
			}
		}
		return result;
	}

	function ioWrite(address, data) {
		for ( var i = 0; i < ioWriteHandlers.length; i++ ) {
			var hndInfo = ioWriteHandlers[i];
			var process = !hndInfo.filter
				|| (hndInfo.filter.mask !== undefined) && (address & hndInfo.filter.mask) == hndInfo.filter.value
				|| hndInfo.filter.range && hndInfo.filter.range.begin <= address && address <= hndInfo.filter.range.end;
			if (process) {
				hndInfo.fn(address, data);
			}
		}
	}

	function varRead(name) {
		var result;
		var namedHandlers = namedVarReadHandlers[name] || [];
		for ( var i = 0; i < namedHandlers.length; i++ ) {
			var subresult = namedHandlers[i](name);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		for ( var i = 0; i < varReadHandlers.length; i++ ) {
			var subresult = varReadHandlers[i](name);
			if (subresult !== undefined) {
				result = subresult;
			}
		}
		return result;
	}

	function varWrite(name, value) {
		var namedHandlers = namedVarWriteHandlers[name] || [];
		for ( var i = 0; i < namedHandlers.length; i++ ) {
			namedHandlers[i](name, value);
		}
		for ( var i = 0; i < varWriteHandlers.length; i++ ) {
			varWriteHandlers[i](name, value);
		}
	}

	function reset() {
		for ( var i = 0; i < resetHandlers.length; i++ ) {
			resetHandlers[i]();
		}
	}

	function opt(name, value) {
		var namedHandlers = namedOptHandlers[name] || [];
		for ( var i = 0; i < namedHandlers.length; i++ ) {
			namedHandlers[i](name, value);
		}
		for ( var i = 0; i < optHandlers.length; i++ ) {
			optHandlers[i](name, value);
		}
	}

	function getBoostPath() {
		return 'ZXContext._boost';
	}
	function getBoostObject() {
		return (ZXContext._boost || (ZXContext._boost = {}));
	}

	this.on_instruction_read = onInstructionRead;
	this.on_mem_read = onMemRead;
	this.on_mem_write = onMemWrite;
	this.on_io_read = onIoRead;
	this.on_io_write = onIoWrite;
	this.on_var_read = onVarRead;
	this.on_var_write = onVarWrite;
	this.on_reset = onReset;
	this.on_opt = onOpt;
	this.instruction_read = instructionRead;
	this.mem_read = memRead;
	this.mem_write = memWrite;
	this.var_read = varRead;
	this.var_write = varWrite;
	this.io_read = ioRead;
	this.io_write = ioWrite;
	this.reset = reset;
	this.opt = opt;
}
