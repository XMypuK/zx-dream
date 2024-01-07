var OPT_TSTATES_PER_INTRQ = "TSTATES_PER_INTRQ";
var OPT_INTRQ_PERIOD = "INTRQ_PERIOD";
var OPT_EXTENDED_MEMORY = "EXTENDED_MEMORY";
var OPT_SEMICOLORS = "SEMICOLORS";
var OPT_RENDERING_PARAMS = "RENDERING_PARAMS";

var VAL_EXTENDED_MEMORY_OFF = 0;
var VAL_EXTENDED_MEMORY_PENTAGON = 1;

var VAL_SCALE_METHOD_UNDEFINED = 0;
var VAL_SCALE_METHOD_PRE = 1; // scaling samples
var VAL_SCALE_METHOD_RENDER = 2;
var VAL_SCALE_METHOD_POST = 3; // scaling by CSS

var VAL_RENDERER_UNDEFINED = 0;
var VAL_RENDERER_PUT_IMAGE_DATA = 1;
var VAL_RENDERER_DRAW_IMAGE = 2;
var VAL_RENDERER_WEB_GL = 3;

var VAL_PSG_OFF = 0;
var VAL_PSG_AY_3_891X = 1;
var VAL_PSG_YM_2149 = 2;

var VAL_EMUL_THREAD_MAIN = 0;
var VAL_EMUL_THREAD_DEDICATED = 1;

function extend(Child, Parent) {
	var F = function() { };
	F.prototype = Parent.prototype;
	Child.prototype = new F();
	Child.prototype.constructor = Child;
	Child.superclass = Parent.prototype;
}

function ZXEvent() {
	var handlers = [];

	this.emit = function (args) {
		for (var i = 0; i < handlers.length; i++) {
			handlers[i](args);
		}
	}

	this.pub = {
		subscribe: function (handler) {
			if (!(typeof handler === 'function'))
				throw new Error('Argument error: Handler must be a function.');
	
			handlers.push(handler);
		},
	
		unsubscribe: function (handler) {
			for (var i = 0; i < handlers.length; i++) {
				if (handlers[i] === handler) {
					handlers.splice(i, 1);
					break;
				}
			}
		}
	};
}

function stringToBytes( str ) {
  	var ch;
  	var stack;
  	var bytes = [];
  	var len = str.length;
  	for (var i = 0; i < len; i++ ) {
	    ch = str.charCodeAt(i);  // get char  
	    stack = [];                 // set up "stack" 
	    do { 
	      stack.push( ch & 0xff );  // push byte to stack 
	      ch = ch >> 8;          // shift value down by 1 byte 
	    }   
	    while ( ch ); 
	    // add stack contents to result 
	    // done because chars have "wrong" endianness 
	    while ( stack.length ) {
	    	bytes.push( stack.pop() );
	    }
	} 
	// return an array of bytes 
	return bytes;
}

function base64Encode( data ) {
	var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	var res = '';

	var i = 0;
	while ( i < data.length ) {
		var count = 0;
		var buf = 0;

		buf |= ( data[i] << 16 );
		count += 2;
		i++;

		if ( i < data.length ) {
			buf |= ( data[i] << 8 );
			count += 1;
			i++;

			if ( i < data.length ) {
				buf |= ( data[i] << 0 );
				count += 1;
				i++;
			}
		}

		for ( c = 0; c < count; c++ ) {
			res += abc.charAt(( buf >> (( 3 - c ) * 6 )) & 0x3f );
		}
	}

	res += '=';

	return res;
}

function base64Decode( str ) {
	var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	var res = [];

	var buf;
	var stage = 0;
	var i = 0;
	while ( i < str.length ) {
		var ch = str.charAt(i);
		var bits = abc.indexOf(ch);
		if ( bits == -1 ) {
			break;
		}

		switch ( stage ) {
			case 0: buf = bits; break;
			case 1: res.push(( buf << 2 ) | ( bits >> 4 )); buf = ( bits & 0x0f ); break;
			case 2: res.push(( buf << 4 ) | ( bits >> 2 )); buf = ( bits & 0x03 ); break;
			case 3: res.push(( buf << 6 ) | ( bits >> 0 )); break;
		}

		stage = ( stage + 1 ) & 3;
		i++;
	}

	return res;
}

function handleError(error) {
	window.console && console.log && console.log(error);
}

function doRequest(options) {
	return new Promise(function (resolve, reject) {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function () {
			if (req.readyState === XMLHttpRequest.DONE) {
				if (req.status === 200) {
					var response = req.response;
					// HACK for IE11
					if (options.responseType === 'json' && typeof response === 'string') {
						response = JSON.parse(response);
					}
					resolve(response);
				}
				else 
					reject(req.statusText);
			}
		}
		req.open(options.method || 'GET', options.url, !options.sync);
		// 'responseType' and 'timeout' properties should be set after calling 'open' method.
		// Otherwise, 'Invalid state error' is produced in IE11.
		req.responseType = options.responseType || '';
		req.send(options.data || undefined);
	});
}

function loadLocalFile(fileinput) {
	return new Promise(function (resolve, reject) {
		try {
			if (!fileinput)
				throw new Error('Не указано поле ввода для загрузки.');
			if (typeof File !== 'undefined' && typeof FileReader !== 'undefined') {
				// загрузка с диска напрямую
				var reader = new FileReader();
				reader.onload = function(e) { 
					var data = stringToBytes(e.target.result);
					resolve(data); 
				}
				reader.onerror = function(e) { 
					reject(e); 
				}
				reader.readAsBinaryString(fileinput.files[0]);
			}
			else {
				// загрузка с диска через сервер
				var iframe = document.createElement('iframe');
				iframe.id = 'file_load_frame';
				iframe.name = 'file_load_frame';
				iframe.style.display = 'none';

				var form = document.createElement('form');
				form.action = '/get_base64.php?input=' + encodeURIComponent(fileinput.name);
				form.method = 'POST';
				form.enctype = 'multipart/form-data';
				form.target = 'file_load_frame';
				form.append(fileinput);

				iframe.addEventListener('load', function (e) {
					var base64 = (iframe.textContent || '').replace(/^\s+|\s+$/g, '');
					var data = base64Decode(base64);
					iframe.remove();
					form.remove();
					resolve(data);
				});
				iframe.addEventListener('error', function (e) {
					reject(e);
				});

				document.body.append(iframe);
				document.body.append(form);
				form.submit();
			}
		}
		catch (error) {
			reject(error);
		}
	});
}

function loadServerFile(filename) {
	return new Promise(function (resolve, reject) {
		if (!filename) {
			reject('Не указано имя файла.');
			return;
		}
		var typeMatch = (/\.([^\.\\\/]+)$/).exec(filename);
		var type = typeMatch && typeMatch[1] || '';

		doRequest({
			url: '/get_base64.php?type=' + encodeURIComponent(type) + '&name=' + encodeURIComponent(filename),
			responseType: 'text'
		}).then(function (base64_data) {
			var data = base64Decode(base64_data);
			resolve(data);
		}).catch(function (error) {
			reject(error);
		});
	});
}

function downloadText(text, filename) {
	text = text || '';
	filename = filename || 'data.txt';
	var data = new Array(text.length);
	for ( var i = 0; i < text.length; i++ ) {
		data[i] = text.charCodeAt(i);
	}
	downloadBinaryData(data, filename);
}

function downloadBinaryData(data, filename) {
	filename = filename || 'data.bin';
	if (window.URL && URL.createObjectURL && window.Blob) {
		var typedData = new Uint8Array(data);
		var file = new Blob([typedData], { type: 'application/octet-stream' });
		if (window.navigator.msSaveBlob) {
			// works in IE11
			window.navigator.msSaveBlob(file, filename);
		}
		else {
			// works in other browsers
			var link = document.createElement('a');
			link.href = URL.createObjectURL(file);
			link.download = filename;
			link.click();
			URL.revokeObjectURL(link.href);
		}
	}
	else {
		var base64_data = base64Encode(data);
		var action_url = 'get_bin.php?input=data&name=' + filename;
		var $form = $('<form action="' + action_url + '" method="post" target="_blank" style="display: none;" />').appendTo(document.body);
		var $i_data = $('<input type="hidden" name="data" />').appendTo($form);
		$i_data.val(base64_data);
		$form.submit();
	}
}

function isWebGLSupported() {
	try { 
		if (!!document.createElement('canvas').getContext('webgl'))
			return true;
	} catch (e) { }
	try {
		if (!!document.createElement('canvas').getContext('experimental-webgl'))
			return true;
	} catch (e) { }
	return false;
}

function isAudioContextSupported() {
	return !!(window.AudioContext || window.webkitAudioContext || window.audioContext);
}

function CRC16GEN(poly, init) {
	this._init = init;
	this._poly = poly;
	this._value = init;

	this.get_value = function () {
		return this._value;
	}
	this.reset = function () {
		this._value = this._init;
	}
	this.preset = function(value) {
		this._value = value & 0xFFFF;
	}
	this.add = function (next) {
		this._value ^= ( next << 8 );
		for ( var i = 0; i < 8; i++ ) {
			this._value = (( this._value & 0x8000 ) ? (( this._value << 1 ) ^ this._poly ) : ( this._value << 1 )) & 0xFFFF;
		}
	}
	this.addArray = function (arr, begin, length) {
		if (typeof begin === 'undefined') {
			begin = 0;
		}
		var end = arr.length;
		if (typeof length !== 'undefined') {
			end = begin + length;
		}
		while (begin < end) {
			this.add(arr[begin++]);
		}
	}
}
CRC16GEN.poly_1021 = function() { return new CRC16GEN(0x1021, 0xFFFF); }
CRC16GEN.poly_A097 = function() { return new CRC16GEN(0xA097, 0x0000); }

function CRC32GEN(poly, init) {
	this._init = init;
	this._poly = poly;
	this._value = init;

	this.get_value = function () {
		return this._value;
	}
	this.reset = function () {
		this._value = this._init;
	}
	this.preset = function(value) {
		this._value = value & 0xFFFFFFFF;
	}
	this.add = function (next) {
		this._value ^= -1 ^ next;
		for ( var i = 0; i < 8; i++ ) {
			var temp = -(this._value & 1);
			this._value >>= 1;
			this._value ^= this._poly & temp;
		}
		this._value ^= -1;
	}
	this.addArray = function (arr, begin, length) {
		if (typeof begin === 'undefined') {
			begin = 0;
		}
		var end = arr.length;
		if (typeof length !== 'undefined') {
			end = begin + length;
		}
		while (begin < end) {
			this.add(arr[begin++]);
		}
	}
}
CRC32GEN.poly_edb88320 = function() { return new CRC32GEN(0xEDB88320, 0xFFFFFFFF); }

function CRC16TD() {
	// CRC16 TELEDISK
	// Poly: 0xA097

	this.value = 0x0000;
	this.add = function (next) {
		this.value ^= ( next << 8 );
		for ( var i = 0; i < 8; i++ ) {
			this.value = (( this.value & 0x8000 ) ? (( this.value << 1 ) ^ 0xA097 ) : ( this.value << 1 )) & 0xFFFF;
		}
	}
	this.addArray = function (arr, begin, length) {
		if (typeof begin === 'undefined') {
			begin = 0;
		}
		var end = arr.length;
		if (typeof length !== 'undefined') {
			end = begin + length;
		}
		while (begin < end) {
			this.add(arr[begin++]);
		}
	}
}

function CRC16() {
	// CRC16 CCITT
	// Poly: 0x1021		x^16 + x^12 + x^5 + 1

	this.value = 0xFFFF;
	this.add = function (next) {
		this.value = ((this.value << 8) ^ CRC16.table[(this.value >> 8) ^ (next & 0xFF)]) & 0xFFFF;
	}
	this.addArray = function (arr, begin, length) {
		if (typeof begin === 'undefined') {
			begin = 0;
		}
		var end = arr.length;
		if (typeof length !== 'undefined') {
			end = begin + length;
		}
		while (begin < end) {
			this.add(arr[begin++]);
		}
	}
}
CRC16.table = [
	0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7, 0x8108, 0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF,
	0x1231, 0x0210, 0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6, 0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE,
	0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485, 0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D,
	0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4, 0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D, 0xC7BC,
	0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823, 0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
	0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12, 0xDBFD, 0xCBDC, 0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A,
	0x6CA6, 0x7C87, 0x4CE4, 0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41, 0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B, 0x8D68, 0x9D49,
	0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70, 0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78,
	0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F, 0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
	0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E, 0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
	0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D, 0x34E2, 0x24C3, 0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
	0xA7DB, 0xB7FA, 0x8799, 0x97B8, 0xE75F, 0xF77E, 0xC71D, 0xD73C, 0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676, 0x4615, 0x5634,
	0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB, 0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3,
	0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A, 0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92,
	0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9, 0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
	0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8, 0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0
];


var SeekOrigin = {
	begin: 0,
	current: 1,
	end: 2
};
function MemoryStream(data) {
	var _position = 0;

	this.get_buffer = function () {
		return data;
	}
	this.get_position = function () {
		return _position;
	}
	this.get_length = function () {
		return data.length;
	}
	this.seek = function (offset, origin) {
		offset = offset !== undefined ? offset : 0;
		origin = origin !== undefined ? origin : SeekOrigin.begin;
		var basePosition;
		switch (origin) {
			case SeekOrigin.current: basePosition = _position; break;
			case SeekOrigin.end: basePosition = data.length; break;
			default: basePosition = 0; break;
		}
		var position = basePosition + offset;
		while (position < 0 && data.length > 0) position += data.length;
		if (position < 0) position = 0;
		if (position > data.length) position = data.length;
		_position = position;
	}
	this.write = function (value) {
		if (_position < data.length) {
			data[_position++] = value;
		}
		else {
			data.push(value);
			_position++;
		}
	}
	this.read = function () {
		if (_position < data.length) {
			return data[_position++];
		}
		else {
			return -1;
		}
	}
	this.writeMultiple = function (elements) {
		for (var i = 0; i < elements.length; i++, _position++) {
			if (_position < data.length) {
				data[_position] = elements[i];
			}
			else {
				data.push(elements[i]);
			}
		}
	}
	this.readMultuple = function (count) {
		var begin = _position;
		var end = _position + count;
		if (end > data.length) {
			end = data.length;
		}
		_position = end;
		return data.slice(begin, end);
	}
}

function CRCWrapper(stream, crc) {
	this._stream = stream;
	this._crc = crc;
	this.writeNoCrc = this._stream.write.bind(this._stream);
	this.readNoCrc = this._stream.read.bind(this._stream);
	this.writeMultipleNoCrc = this._stream.writeMultiple.bind(this._stream);
	this.readMultupleNoCrc = this._stream.readMultuple.bind(this._stream);

	this.get_stream = function () {
		return this._stream;
	}

	this.get_crc = function () {
		return this._crc;
	}

	this.get_buffer = function () {
		return this._stream.get_buffer();
	}

	this.seek = function(offset, origin) {
		return this._stream.seek(offset, origin);
	}
	
	this.get_length = function() {
		return this._stream.get_length();
	}

	this.write = function (value) {
		this._crc.add(value);
		this.writeNoCrc(value);
	}

	this.read = function () {
		var value = this.readNoCrc();
		if (value >= 0) {
			this._crc.add(value);
		}
		return value;
	}

	this.writeMultiple = function (elements) {
		this._crc.addArray(elements);
		this.writeMultipleNoCrc(elements);
	}

	this.readMultuple = function (count) {
		var elements = this.readMultupleNoCrc(count);
		this._crc.addArray(elements);
		return elements;
	}
}

/*
 * При реализации следующего класса частично были использованы (с предварительной переработкой)
 * исходные коды Miodrag Milanovic (https://git.redump.net/mame/tree/src/lib/formats/td0_dsk.cpp)
 * и Flat Rock Software (https://github.com/CatacombGames/CatacombApocalypse/blob/master/LZHUF.C),
 * распространяемые под свободными лицензиями (BSD-3-Clause, GNU).
 */
function LZSSDecompressionStream(underlyingStream) {
	var _underlyingStream = underlyingStream;

	var STR_BUF_SIZE = 4096; // Size of string buffer
	var FWD_BUF_SIZE = 60; // Size of look-ahead buffer
	var THRESHOLD = 2;
	var buffer = new Array(STR_BUF_SIZE + FWD_BUF_SIZE - 1);
	var bufferBegin = 0;
	var bufferCount = 0;
	var bufferIndex = 0;
	var bufferRIndex = 0;

	// 0..255 - ordinary characters
	// 256..313 - sequences
	var DICT_SIZE = (256 - THRESHOLD + FWD_BUF_SIZE);
	// nodes + root (627)
	var TABLE_SIZE = (DICT_SIZE * 2 - 1);
	// root position (626)
	var ROOT_POS = (TABLE_SIZE - 1); 
	// update when cumulative frequency reaches this value
	var MAX_FREQ = 0x8000; 
	// cumulative freq table (short[])
	// freq[TABLE_SIZE] = 0xFFFF - barricade
	var freq = new Array(TABLE_SIZE + 1); 
	// [0..R] - parent nodes references
	// [TABLE_SIZE..(TABLE_SIZE + DICT_SIZE - 1)] - pointers for leaves
	var prnt = new Array(TABLE_SIZE + DICT_SIZE);
	// pointing children nodes (son[], son[] + 1)
	var son = new Array(TABLE_SIZE);
	
	var bitsBuf = 0;
	var bitsPos = 8;
	var bitsMask = [0x00, 0x01, 0x03, 0x07, 0x0F, 0x1F, 0x3F, 0x7F, 0xFF];

	/*
	 * Tables for encoding/decoding upper 6 bits of
	 * sliding dictionary pointer
	 */

	// decoder table
	var d_code = [
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
		0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
		0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02,
		0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02,
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
		0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
		0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A,
		0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B,
		0x0C, 0x0C, 0x0C, 0x0C, 0x0D, 0x0D, 0x0D, 0x0D,
		0x0E, 0x0E, 0x0E, 0x0E, 0x0F, 0x0F, 0x0F, 0x0F,
		0x10, 0x10, 0x10, 0x10, 0x11, 0x11, 0x11, 0x11,
		0x12, 0x12, 0x12, 0x12, 0x13, 0x13, 0x13, 0x13,
		0x14, 0x14, 0x14, 0x14, 0x15, 0x15, 0x15, 0x15,
		0x16, 0x16, 0x16, 0x16, 0x17, 0x17, 0x17, 0x17,
		0x18, 0x18, 0x19, 0x19, 0x1A, 0x1A, 0x1B, 0x1B,
		0x1C, 0x1C, 0x1D, 0x1D, 0x1E, 0x1E, 0x1F, 0x1F,
		0x20, 0x20, 0x21, 0x21, 0x22, 0x22, 0x23, 0x23,
		0x24, 0x24, 0x25, 0x25, 0x26, 0x26, 0x27, 0x27,
		0x28, 0x28, 0x29, 0x29, 0x2A, 0x2A, 0x2B, 0x2B,
		0x2C, 0x2C, 0x2D, 0x2D, 0x2E, 0x2E, 0x2F, 0x2F,
		0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
		0x38, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E, 0x3F
	];

	var d_len = [
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
		0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
		0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08
	];

	function init() {
		// init freqiencies, children and parents
		for ( var i = 0; i < DICT_SIZE; i++ ) {
			freq[i] = 1;
			son[i] = i + TABLE_SIZE;
			prnt[i + TABLE_SIZE] = i;
		}
		for ( var i = DICT_SIZE, j = 0; i < TABLE_SIZE; i++, j += 2 ) {
			freq[i] = (freq[j] + freq[j + 1]) & 0xFFFF;
			son[i] = j;
			prnt[j] = i;
			prnt[j + 1] = i;
		}
		freq[TABLE_SIZE] = 0xFFFF;
		prnt[ROOT_POS] = 0;
		// init buffer
		var bufferEnd = STR_BUF_SIZE - FWD_BUF_SIZE;
		for ( var i = 0; i < bufferEnd; i++ ) {
			buffer[i] = 0x20;
		}
		bufferRIndex = bufferEnd;
	}

	function readBits(count) {
		var nFromBuffer = Math.min(8 - bitsPos, count);
		var nFromStream = count - nFromBuffer;
		var value = (bitsBuf >> (8 - bitsPos - nFromBuffer)) & bitsMask[nFromBuffer];
		if (nFromStream > 0) {
			var bitsRead = 0;
			do {
				bitsBuf = _underlyingStream.read();
				if (bitsBuf < 0)
					throw new Error('An unexpected end of the underlying stream.');
				var bitsRead = Math.min(nFromStream, 8);
				value = (value << bitsRead) | (bitsBuf >> (8 - bitsRead) & bitsMask[bitsRead]);
				nFromStream -= bitsRead;
			}
			while (nFromStream > 0);
			bitsPos = bitsRead;
		}
		else {
			bitsPos += nFromBuffer;
		}
		return value;
	}


	// reconstruct freq tree
	function reconst() {
		// halven cumulative req for leaf nodes
		var j = 0;
		for ( var i = 0; i < TABLE_SIZE; i++ ) {
			if (son[i] >= TABLE_SIZE) {
				freq[j] = (freq[i] + 1) >> 1;
				son[j] = son[i];
				j++;
			}
		}
		// make a tree : first, connect children nodes
		for ( var i = DICT_SIZE, j = 0; i < TABLE_SIZE; i++, j += 2 ) {
			var f = freq[i] = (freq[j] + freq[j + 1]) & 0xFFFF;
			for (var k = i; f < freq[k - 1]; k--) { }
			var len = i - k;
			move(freq, k + 1, k, len);
			freq[k] = f;
			move(son, k + 1, k, len);
			son[k] = j;
		}
		// connect parent nodes
		for ( var i = 0; i < TABLE_SIZE; i++ ) {
			var j = son[i];
			if (j >= TABLE_SIZE) {
				prnt[j] = i
			}
			else {
				prnt[j] = i;
				prnt[j + 1] = i;
			}
		}
	}

	// update freq tree
	function update(c) {
		if (freq[ROOT_POS] == MAX_FREQ) {
			reconst();
		}
		c = prnt[c + TABLE_SIZE];
		do {
			var k = freq[c] = (freq[c] + 1) & 0xFFFF;
			// swap nodes to keep the tree freq-ordered
			var l;
			if (k > freq[l = c + 1]) {
				while (k > freq[++l]) {}
				l--;
				freq[c] = freq[l];
				freq[l] = k;

				var i = son[c];
				prnt[i] = l;
				if (i < TABLE_SIZE) prnt[i + 1] = l;

				var j = son[l];
				son[l] = i;

				prnt[j] = c;
				if (j < TABLE_SIZE) prnt[j + 1] = c;
				son[c] = j;

				c = l;
			}
		}
		while ((c = prnt[c]) != 0) // do it until reaching the root
	}

	function move(arr, di, si, len) {
		if (di > si) {
			di += len;
			si += len;
			while (len--) {
				arr[--di] = arr[--si];
			}
		}
		else {
			while (len--) {
				arr[di++] = arr[si++];
			}
		}
	}

	function decodeChar() {
		var c = son[ROOT_POS];
		/*
		 * start searching tree from the root to leaves.
		 * choose node #(son[]) if input bit == 0
		 * else choose #(son[]+1) (input bit == 1)
		 */	
		while (c < TABLE_SIZE) {
			c += readBits(1);
			c = son[c];
		}
		c -= TABLE_SIZE;
		update(c);
		return c;
	}

	function decodePosition() {
		var i = readBits(8);
		var upperBits = d_code[i];
		var len = d_len[i] - 2;
		var lowerBits = readBits(len);
		i = (i << len) | lowerBits;
		return (upperBits << 6) | (i & 0x3F);
	}

	// Decoding/Uncompressing
	function decode() {
		if (bufferCount > 0)
			return getFromBuffer();

		var c = decodeChar();
		if (c < 256) {
			buffer[bufferRIndex++] = c;
			bufferRIndex &= (STR_BUF_SIZE - 1);
			return c;
		}
		// put to buffer
		var pos = decodePosition();
		bufferBegin = (bufferRIndex - pos - 1) & (STR_BUF_SIZE - 1);
		bufferCount = c - 255 + THRESHOLD;
		bufferIndex = 0;
		return getFromBuffer();
	}

	function getFromBuffer() {
		// assert bufferIndex < bufferCount
		var c = buffer[(bufferBegin + bufferIndex) & (STR_BUF_SIZE - 1)];
		buffer[bufferRIndex++] = c;
		bufferRIndex &= (STR_BUF_SIZE - 1);
		bufferIndex++;
		if (bufferIndex >= bufferCount) {
			bufferIndex = bufferCount = 0;
		}
		return c;
	}

	function read() {
		return decode();
	} 

	function readMultuple(count) {
		var result = new Array(count);
		for ( var i = 0; i < count; i++) {
			result[i] = decode();
		}
		return result;
	}

	this.get_buffer = function () {
		throw new Error('Unsupported exception.');
	}
	this.get_position = function () {
		throw new Error('Unsupported exception.');
	}
	this.get_length = function () {
		throw new Error('Unsupported exception.');
	}
	this.seek = function (offset, origin) {
		throw new Error('Unsupported exception.');
	}
	this.read = read;
	this.readMultuple = readMultuple;
	this.write = function () {
		throw new Error('Unsupported exception');
	}
	this.writeMultiple = function (elemenets) {
		throw new Error('Unsupported exception');
	}

	init();
}

ko.extenders.numeric = function(target, precision) {
    //create a writable computed observable to intercept writes to our observable
    var result = ko.pureComputed({
        read: target,  //always return the original observables value
        write: function(newValue) {
            var current = target(),
                roundingMultiplier = Math.pow(10, precision),
                newValueAsNum = isNaN(newValue) ? 0 : +newValue,
                valueToWrite = Math.round(newValueAsNum * roundingMultiplier) / roundingMultiplier;
 
            //only write if it changed
            if (valueToWrite !== current) {
                target(valueToWrite);
            } else {
                //if the rounded value is the same, but a different value was written, force a notification for the current field
                if (newValue !== current) {
                    target.notifySubscribers(valueToWrite);
                }
            }
        }
    }).extend({ notify: 'always' });
 
    //initialize with current value to make sure it is rounded appropriately
    result(target());
 
    //return the new computed observable
    return result;
};