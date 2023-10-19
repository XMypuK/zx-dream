var OPT_TSTATES_PER_INTRQ = "TSTATES_PER_INTRQ";
var OPT_INTRQ_PERIOD = "INTRQ_PERIOD";
var OPT_EXTENDED_MEMORY = "EXTENDED_MEMORY";
var OPT_SEMICOLORS = "SEMICOLORS";
var OPT_SCALE_METHOD = "SCALE_METHOD";
var OPT_SCALE = "SCALE";
var OPT_RENDERER = "RENDERER";
var OPT_USE_TYPED_ARRAYS = "USE_TYPED_ARRAYS";
var OPT_RENDER_ON_ANIMATION_FRAME = "RENDER_ON_ANIMATION_FRAME";

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

function loadLocalFile(fileinput) {
	var promise$ = $.Deferred();
	try {
		if (!fileinput)
			throw new Error('Не указано поле ввода для загрузки.');
		if ( window.File && window.FileReader ) {
			// загрузка с диска напрямую
			var reader = new FileReader();
			reader.onload = function(e) { 
				var data = stringToBytes(e.target.result);
				promise$.resolve(data); 
			}
			reader.onerror = function(e) { 
				promise$.reject(e); 
			}
			reader.readAsBinaryString(fileinput.files[0]);
		}
		else {
			// загрузка с диска через сервер
			var action_url = 'get_base64.php?input=' + encodeURIComponent(fileinput.name);
			var $iframe =
				$('<iframe>')
					.prop({ id: 'file_load_frame', name: 'file_load_frame' })
					.css('display', 'none')
					.appendTo(document.body);
			var $form = 
				$('<form>')
					.prop({ action: action_url, method: 'post', enctype: 'multipart/form-data', target: 'file_load_frame' })
					.append(fileinput)
					.appendTo(document.body);

			$iframe.on('load', function(e) {
				var base64_data = $iframe.contents().text().trim();
				var data = base64Decode(base64_data)
				$iframe.remove();
				$form.remove();
				promise$.resolve(data);
			});
			$iframe.on('error', function(e) { 
				promise$.reject(e); 
			});
			$form.submit();
		}
	}
	catch (error) {
		promise$.reject(error);
	}
	return promise$;
}

function loadServerFile(filename) {
	var promise$ = $.Deferred();
	try {
		if (!filename)
			throw new Error('Не указано имя файла.');
		var typeMatch = (/\.([^\.\\\/]+)$/).exec(filename);
		var type = typeMatch && typeMatch[1] || '';
		$.ajax({
			url: 'get_base64.php?type=' + encodeURIComponent(type) + '&name=' + encodeURIComponent(filename),
			dataType: 'text'
		}).then(function (base64_data) {
			var data = base64Decode(base64_data);
			promise$.resolve(data);
		}).fail(function (error) {
			promise$.reject(error);
		});
	}
	catch (error) {
		promise$.reject(error);
	}
	return promise$;
}

function downloadBinaryData(data, filename) {
	filename = filename || 'data.bin';
	var base64_data = base64Encode(data);

	var action_url = 'get_bin.php?input=data&name=' + filename;
	var $form = $('<form action="' + action_url + '" method="post" target="_blank" style="display: none;" />').appendTo(document.body);
	var $i_data = $('<input type="hidden" name="data" />').appendTo($form);
	$i_data.val(base64_data);
	$form.submit();
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

function isTypedArraysSupported() {
	return ('ArrayBuffer' in window);
}