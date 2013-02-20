function ZX_Bus() {
	'use strict';

	var self = this;
	var devs = [];
	var vars = {};

	function reset() {
		for (var i = 0; i < devs.length; i++) {
			devs[i].reset(self);
		}
	}

	function request( state ) {
		if ( state.mreq ) {
			for (var i = 0; i < devs.length; i++) {
				devs[i].mreq(state, self);
			}
		}
		else if ( state.dreq ) {
			for (var i = 0; i < devs.length; i++) {
				devs[i].dreq(state, self);
			}
		}
		else if ( state.iorq ) {
			if ( state.read ) {
				state.data = 0xff;
			}

			for (var i = 0; i < devs.length; i++) {
				devs[i].iorq(state, self);
			}
		}
	}

	function set_var( name, value ) {
		vars[ name ] = value;
		raise('var_changed', { name: name, value: value });
	}

	function get_var( name ) {
		return vars[ name ];
	}

	function raise( name, options ) {
		for (var i = 0; i < devs.length; i++) {
			devs[i].event(name, options, self);
		}
	}

	function connect(dev) {
		if (dev_by_id(dev.id()) == null) {
			for (var i = 0; i < dev.depend_ids().length; i++) {
				var dep_id = dev.depend_ids()[i];
				var dep_dev = exclude_dev_for_embeding(dep_id);
				if (dep_dev == null) {
					throw new Error("Depend device depend device \"" + dep_id + "\" not found");
				}

				dev.embed(dep_dev);
			}
			devs.push(dev);
		}
		else {
			throw new Error("The device already is present in the list");
		}
	}

	function dev_by_id(dev_id) {
		for (var i = 0; i < devs.length; i++) {
			if (devs[i].contains_id(dev_id)) {
				return devs[i];
			}
		}

		return null;
	}

	function exclude_dev_for_embeding(dev_id) {
		for (var i = 0; i < devs.length; i++) {
			if (devs[i].contains_id(dev_id)) {
				var dev = devs[i];
				devs.splice(i, 1);
				return dev;
			}
		}

		return null;
	}

	this.connect = connect;
	this.reset = reset;
	this.request = request;
	this.set_var = set_var;
	this.get_var = get_var;
	this.raise = raise;
}

// При создании переменная options должна содержать
// следующий члены:
// id - строковый идентификатор
// depend_ids - идентификатор устройства, от которого зависит работа данного устройства, либо массив таких идентификаторов (или null).
// request - function(state), реализация функции обработки запроса
function ZX_Device(options) {
	'use strict';
	
	options = options || {};

	var id = options.id || '';

	var depend_ids = [];
	if (options.depend_ids) {
		if (typeof options.depend_ids == 'string') {
			depend_ids.push(options.depend_ids);
		}
		else if (typeof options.depend_ids == 'object') {
			depend_ids = options.depend_ids.slice(0);
		}
	}

	var embeds = [];

	function contains_id(dev_id) {
		if (id == dev_id) {
			return true;
		}

		for (var i = 0; i < embeds.length; i++) {
			if (embeds[i].contains_id(dev_id)) {
				return true;
			}
		}

		return false;
	}

	function embed(dev) {
		embeds.push(dev);
	}

	function get_embed_by_id(dev_id) {
		for (var i = 0; i < embeds.length; i++) {
			if (embeds[i].contains_id(dev_id)) {
				return embeds[i];
			}
		}

		return null;
	}

	// id();
	// возвращает id модуля
	this.id = function() { return id; }

	// depend_ids();
	// возвращает список идентификаторов устройств, от которых зависит данное устройство
	this.depend_ids = function() { return depend_ids; }

	// get_embed_by_id(dev_id);
	// возвращает зависимый устройство, в иерархии зависимости которого
	// есть устройство с данным dev_id
	this.get_embed_by_id = get_embed_by_id;

	// contains_id(dev_id);
	// проверяет есть ли в иерархии зависимости устройство с данным dev_id
	this.contains_id = contains_id;

	// embed(dev);
	// встраивает модуль, от которого зависит данный.
	this.embed = embed;

	this.reset = options.reset || (function(){});
	this.iorq = options.iorq || (function(){});
	this.mreq = options.mreq || (function(){});
	this.dreq = options.dreq || (function(){});
	this.event = options.event || (function(){});
}