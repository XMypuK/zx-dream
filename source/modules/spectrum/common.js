function create_xhr() {
	try { return new ActiveXObject("Msxml2.XMLHTTP"); }
	catch (e) {
		try { return new ActiveXObject("Microsoft.XMLHTTP"); } 
		catch (ee) { }
	}
	if (typeof XMLHttpRequest!='undefined') {
		return new XMLHttpRequest();
	}
}

function string_to_bytes( str ) {
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

function ajax_get_text( url, ready ) {
	var xhr = create_xhr();
	xhr.open('GET', url, true);
	xhr.onreadystatechange = function() {
		if ( xhr.status == 200 && xhr.readyState == 4 && typeof ready == 'function' ) {
			ready(xhr.responseText);
		}
	}
	xhr.send(null);
}

function base64_encode( data ) {
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

function base64_decode( str ) {
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