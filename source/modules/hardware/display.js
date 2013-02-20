function ZX_Display ( container ) {
	'use strict';
	// данная версия дисплея перерисовывает необходимые области сразу по мере их изменения в памяти

	// экран 256 x 192
	// 6144 (0x1800) байт под пикселы
	// 768 (0x300) байт под цвета знакомест
	// 6912 (0x1b00) байт всего

	// соответствие координат и памяти экрана:

	// address: 010p pyyy rrrx xxxx
	// point.y: pprr ryyy
	// point.x: xxxx xbbb

	// pp (0-2) - часть экрана (верхняя, средняя, нижняя)
	// rrr (0-7) - вертикальное знакоместо относительно части экрана
	// yyy (0-7) - номер строки относительно знакоместа
	// xxxxx (0-31) - байт в строке
	// bbb (0-7) - бит в байте (начиная со старшего!)

	// =================================================================
	// вот так гораздо быстрее:
	// ctx.drawImage(sample_canvas, _sx, _sy, _w, _h, _dx, _dy, _w, _h);
	//
	// чем так:
	// var data = sample_ctx.getImageData(_sx, _sy, _w, _h);
	// ctx.putImageData(data, _dx, _dy);
	// =================================================================

	var border_width = 16;
	var screen_width = 256;
	var screen_height = 192;
	var scale = 2;
	var semicolors = false;
	var invert = false;
	var flash_interval = 512;

	var inited = false;
	var port_7ffd_value = 0x00;
	var port_fe_value = 0x00;
	var border_changed = false;
	var _bus = null;

	// Если используются слои, то холст пятого экрана размещается
	// над холством бордюра, а холст седьмого экрана - над пятым.
	// Когда включен пятый экран, то холст седьмого делается
	// прозрачным.
	// Если слои не используются, то в зависимости от выбранного
	// экрана содержимое из его холста отрисовывается на холсте
	// бордюра.
	// Со слоями, вроде, чуточку быстрее.
	var use_layers = true;

	var brd_canvas = document.createElement('canvas');
	brd_canvas.width = ( screen_width + 2 * border_width ) * scale;
	brd_canvas.height = ( screen_height + 2 * border_width ) * scale;
	init_canvas(brd_canvas);

	var scr5_canvas = document.createElement('canvas');
	scr5_canvas.width = screen_width * scale;
	scr5_canvas.height = screen_height * scale;
	init_canvas(scr5_canvas);

	var scr7_canvas = document.createElement('canvas');
	scr7_canvas.width = screen_width * scale;
	scr7_canvas.height = screen_height * scale;
	init_canvas(scr7_canvas);

	container.appendChild(brd_canvas);
	if ( use_layers ) {
		scr5_canvas.style.position = 'absolute';
		scr5_canvas.style.left = ( border_width * scale ) + 'px';
		scr5_canvas.style.top = ( border_width * scale ) + 'px';
		scr7_canvas.style.position = 'absolute';
		scr7_canvas.style.left = ( border_width * scale ) + 'px';
		scr7_canvas.style.top = ( border_width * scale ) + 'px';
		scr7_canvas.style.opacity = 0;

		container.appendChild(scr5_canvas);
		container.appendChild(scr7_canvas);
	}

	var brd_ctx = brd_canvas.getContext('2d');
	var scr5_ctx = scr5_canvas.getContext('2d');
	var scr7_ctx = scr7_canvas.getContext('2d');

	function init_canvas( canvas ) {
		var ctx = canvas.getContext('2d');
		var image_data = ctx.createImageData(canvas.width, canvas.height);
		var image_data_length = image_data.width * image_data.height * 4;
		for ( var i = 0; i < image_data_length; i += 4 ) {
			image_data.data[i + 0] = 0x00;
			image_data.data[i + 1] = 0x00;
			image_data.data[i + 2] = 0x00;
			image_data.data[i + 3] = 0xff;
		}
		ctx.putImageData(image_data, 0, 0);
	}

	var scr5_buffer = new ScreenBuffer();
	var scr7_buffer = new ScreenBuffer();

	function ScreenBuffer() {
		var buffer = [];
		var dirty = [];
		var last_invert = false;

		for ( var address = 0; address < 0x1b00; address++ ) {
			buffer[address] = 0;
		}

		for ( var address = 0; address < 0x1800; address++ ) {
			dirty[address] = false;
		}

		this.write = function ( address, data ) {
			if ( buffer[address] != data ) {
				buffer[address] = data;

				if ( address < 0x1800 ) {
					dirty[address] = true;
				}
				else {
					var region = get_region_by_address(address);
					var point = get_point_by_region(region);
					for ( var i = 0; i < 8; i++ ) {
						var point_address = get_address_by_point(point);
						dirty[point_address] = true;
						point.y++;
					}
				}
			}
		}

		this.dirty_all = function() {
			for ( var address = 0; address < 0x1800; address++ ) {
				dirty[address] = true;
			}
		}

		this.process_dirty = function ( f ) {
			if ( last_invert != invert ) {
				for ( var address = 0x1800; address < 0x1b00; address++ ) {
					if ( buffer[address] & 0x80 ) {
						var region = get_region_by_address(address);
						var point = get_point_by_region(region);
						for ( var i = 0; i < 8; i++ ) {
							var point_address = get_address_by_point(point);
							dirty[point_address] = true;
							point.y++;
						}
					}
				}

				last_invert = invert;
			}

			for ( var address = 0; address < 0x1800; address++ ) {
				if ( dirty[address] ) {
					var point = get_point_by_address(address);
					var region = get_region_by_point(point);
					var region_address = get_address_by_region(region);

					f(address, buffer[address], buffer[region_address]);

					dirty[address] = false;
				}
			}
		}
	}

	var draw = null;

	// построение таблицы сэмплов
	if ( (/Firefox|IE/i).test(navigator.userAgent) ) {
		init_samples_ff();
	}
	else {
		init_samples();
	}

	// в Firefox (и возможно, в IE) метод drawImage дает лучшую производительность по сравнению с putImageData
	function init_samples_ff() {
		var sample_canvas = document.createElement('canvas');
		sample_canvas.width = 0x100 * 8 * scale; // 0x100 - количество комбинаций битов в байте
		sample_canvas.height = 0x80 * scale; // 0x80 - количество комбинаций цветов

		var sample_ctx = sample_canvas.getContext('2d');
		var sample_data = sample_ctx.getImageData(0, 0, sample_canvas.width, sample_canvas.height);

		for ( var attr = 0; attr < 0x80; attr++ ) {
			var colors = get_colors_by_attr_byte(attr);

			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				var x = pixels * 8 * scale;
				var y = attr * scale;

				render_pixels(pixels, colors, sample_data, x, y);
			}
		}

		sample_ctx.putImageData(sample_data, 0, 0);

		// рисует 8 пикселов в строку
		// pixels: байт пикслеов (1 бит - 1 пиксел)
		// colors: объект с двумя членами bg и fg, каждый из которых является массивом из 4 компонент цвета
		function render_pixels ( pixels, colors, data, x, y ) {
			//colors = { fg: [0x00,0x00,0x00,0xff], bg: [0xff, 0xff, 0xff, 0xff] };

			for (var pi = 0; pi < 8; pi++) {
				var color = (pixels & (0x80 >> pi)) ? colors.fg : colors.bg;

				for (var dy = 0; dy < scale; dy++) {
					for (var dx = 0; dx < scale; dx++) {

						var ci = ((( y + dy ) * sample_canvas.width ) + ( x + pi * scale + dx )) * 4;
						data.data[ci + 0] = color[0];
						data.data[ci + 1] = color[1];
						data.data[ci + 2] = color[2];
						data.data[ci + 3] = color[3];

					}
				}
			}
		}

		draw = function( screen, pixels, attr, x, y ) {
			var src_x = pixels * 8 * scale;
			var src_y = ( attr & 0x7f ) * scale;
			var dst_x = x * scale;
			var dst_y = y * scale;
			var w = 8 * scale;
			var h = 1 * scale;

			switch ( screen ) {
				case 5: scr5_ctx.drawImage(sample_canvas, src_x, src_y, w, h, dst_x, dst_y, w, h); break;
				case 7: scr7_ctx.drawImage(sample_canvas, src_x, src_y, w, h, dst_x, dst_y, w, h); break;
			}
		}	
	}

	function init_samples() {
		var samples = [];
		for ( var attr = 0; attr < 0x80; attr++ ) {
			var colors = get_colors_by_attr_byte(attr);
			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				samples[ ( pixels << 7 ) | attr ] = render_pixels(pixels, colors);
			}
		}

		// рисует 8 пикселов в строку
		// pixels: байт пикслеов (1 бит - 1 пиксел)
		// colors: объект с двумя членами bg и fg, каждый из которых является массивом из 4 компонент цвета
		function render_pixels(pixels, colors) {
			//colors = { fg: [0x00,0x00,0x00,0xff], bg: [0xff, 0xff, 0xff, 0xff] };
			var image_data = scr5_ctx.createImageData(8 * scale, 1 * scale);

			for (var pi = 0; pi < 8; pi++) {
				var color = (pixels & (0x80 >> pi)) ? colors.fg : colors.bg;

				for (var dy = 0; dy < scale; dy++) {
					for (var dx = 0; dx < scale; dx++) {

						var ci = (dy * 8 * scale + pi * scale + dx) * 4;
						image_data.data[ci + 0] = color[0];
						image_data.data[ci + 1] = color[1];
						image_data.data[ci + 2] = color[2];
						image_data.data[ci + 3] = color[3];

					}
				}
			}

			return image_data;
		}

		draw = function ( screen, pixels, attr, x, y ) {
			var ctx;
			switch ( screen ) {
				case 5: ctx = scr5_ctx; break;
				case 7: ctx = scr7_ctx; break;
			}

			ctx.putImageData(
				samples[ ( pixels << 7 ) | ( attr & 0x7f ) ], 
				x * scale, 
				y * scale
			);
		}
	}

	function get_colors_by_attr_byte(attr_byte) {
		var bright = ( attr_byte & 0x40 );

		return { 
			bg: get_color( bright, attr_byte & 0x10, attr_byte & 0x20, attr_byte & 0x08 ), 
			fg: get_color( bright, attr_byte & 0x02, attr_byte & 0x04, attr_byte & 0x01 )
		};
	}

	function get_color( bright, r, g, b ) {
		return [
			r ? ( bright ? 0xff : 0xbf ) : 0x00,
			g ? ( bright ? 0xff : 0xbf ) : 0x00,
			b ? ( bright ? 0xff : 0xbf ) : 0x00,
			0xff
		];
	}

	function get_point_by_address(address) {
		// assert 0x0000 <= address < 0x1800
		return {
			x: ((address & 0x1f) << 3),
			y: (((address >> 11) & 0x03) << 6) | (((address >> 5) & 0x07) << 3) | ((address >> 8) & 0x07)
		}
	}

	function get_address_by_point(point) {
		return (((point.y >> 6) & 0x03) << 11) | (((point.y >> 3) & 0x07) << 5) | ((point.y & 0x07) << 8) | (point.x >> 3);
		// assert 0x0000 <= returnValue < 0x1800
	}

	// возвращает координаты знакоместа по координатам одной из его точек
	function get_region_by_point(point) {
		return {
			x: point.x >> 3,
			y: point.y >> 3
		}
	}

	// возращает левую верхнюю точку знакоместа
	function get_point_by_region(region) {
		return {
			x: region.x << 3,
			y: region.y << 3
		}
	}

	function get_address_by_region(region) {
		return 0x1800 | (region.y << 5) | region.x;
		// assert 0x1800 <= returnValue < 0x1b00
	}

	function get_region_by_address(address) {
		// assert 0x1800 <= address < 0x1b00
		address &= 0x03ff;
		var region = {};
		region.y = (address >> 5);
		region.x = address - (region.y << 5);
		return region;
	}

	function correct_attr(attr) {
		if ( !semicolors ) {
			attr |= 0x40;
		}

		if ( attr & 0x80 ) {
			attr = 
				invert ?
				( attr & 0x40 ) | (( attr >> 3 ) & 0x07 ) | (( attr & 0x07 ) << 3 ) :
				( attr & 0x7f );
		}

		return attr;		
	}

	function flash_loop() {
		invert = !invert;
		setTimeout(flash_loop, flash_interval);
	}

	function redraw_border() {
		var attr_byte = port_fe_value;
		var bright = !semicolors;

		var color = get_color( bright, attr_byte & 0x02, attr_byte & 0x04, attr_byte & 0x01 );

		var image_data = brd_ctx.createImageData((screen_width + border_width * 2) * scale, border_width * scale);
		for (var i = 0; i < image_data.width * image_data.height * 4; i += 4) {
			image_data.data[i + 0] = color[0];
			image_data.data[i + 1] = color[1];
			image_data.data[i + 2] = color[2];
			image_data.data[i + 3] = color[3];
		}
		brd_ctx.putImageData(image_data, 0, 0);
		brd_ctx.putImageData(image_data, 0, (border_width + screen_height) * scale);

		image_data = brd_ctx.createImageData(border_width * scale, screen_height * scale);
		for (var i = 0; i < image_data.width * image_data.height * 4; i += 4) {
			image_data.data[i + 0] = color[0];
			image_data.data[i + 1] = color[1];
			image_data.data[i + 2] = color[2];
			image_data.data[i + 3] = color[3];
		}
		brd_ctx.putImageData(image_data, 0, border_width * scale);
		brd_ctx.putImageData(image_data, (border_width + screen_width) * scale, border_width * scale);		
	}

	function redraw() {
		scr5_buffer.process_dirty(function(address, pixels, attr) {
			var point = get_point_by_address(address);
			attr = correct_attr(attr);
			draw(5, pixels, attr, point.x, point.y);
		});
		scr7_buffer.process_dirty(function(address, pixels, attr) {
			var point = get_point_by_address(address);
			attr = correct_attr(attr);
			draw(7, pixels, attr, point.x, point.y);
		});

		if ( border_changed ) {
			redraw_border();
			border_changed = false;
		}

		if ( use_layers ) {
			scr7_canvas.style.opacity = ( port_7ffd_value & 0x08 ) ? 1 : 0;
		}
		else {
			brd_ctx.drawImage( port_7ffd_value & 0x08 ? scr7_canvas : scr5_canvas, border_width * scale, border_width * scale );
		}
	}

	var device = new ZX_Device({
		id: 'display',
		reset: function( bus ) {
			_bus = bus;
		},
		event: function( name, options, bus ) {
			_bus = bus;

			if (!inited) {
				inited = true;
				setTimeout(flash_loop, flash_interval);
			}

			if ( name == 'var_changed' ) {
				switch ( options.name ) {
					case 'port_7ffd_value': port_7ffd_value = options.value; break;
					case 'port_fe_value':
						border_changed = border_changed || (( port_fe_value ^ options.value ) & 0x07 );
						port_fe_value = options.value;
						break;
				}
			}
			else if ( name == 'wr_scr_5' ) {
				scr5_buffer.write(options.address, options.data);
			}
			else if ( name == 'wr_scr_7' ) {
				scr7_buffer.write(options.address, options.data);
			}
		}
	});

	device.semicolors = function( value ) {
		if ( value !== undefined ) {
			semicolors = value;
			border_changed = true;
			scr5_buffer.dirty_all();
			scr7_buffer.dirty_all();
		}
		else {
			return value;
		}
	}

	device.redraw = redraw;

	var last_text_w = 0;

	device.set_border_text = function( text ) {
		var max_h = border_width * scale;
		var max_w = ( 2 * border_width + screen_width ) * scale;

		var text_h = 10;

		brd_ctx.font = text_h + 'px sans-serif';
		var text_w = brd_ctx.measureText(text).width;

		var y = +(( max_h - text_h ) / 2 ).toFixed(0);
		var x = 5 * scale;

		var attr_byte = port_fe_value;
		var bright = !semicolors;

		var bg = get_color( bright, attr_byte & 0x02, attr_byte & 0x04, attr_byte & 0x01 );
		var fg = get_color( bright, !(attr_byte & 0x02), !(attr_byte & 0x04), !(attr_byte & 0x01) );

		brd_ctx.fillStyle = 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')';
		brd_ctx.fillRect(x, y, last_text_w, text_h);

		brd_ctx.fillStyle = 'rgb(' + fg[0] + ',' + fg[1] + ',' + fg[2] + ')';
		brd_ctx.fillText(text, x, y + text_h, max_w - x);

		last_text_w = text_w;
	}

	return device;
}