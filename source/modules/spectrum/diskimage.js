function DiskImage( _head_count, _write_protect, _filename, _description ) {
	// public
	this.get_filename = function() { return filename; }
	this.get_description = function() { return description; }
	this.is_write_protected = function() { return write_protect; }
	this.get_cyl_count = function() { return cylinders.length; }
	this.get_head_count = function() { return head_count; }
	this.clear = clear; // function();
	this.add_cyl = add_cyl; // function();
	this.get_track = get_track; // function( cyl_index, head_index );

	// private
	var filename = _filename;
	var description = _description;

	var write_protect = _write_protect;
	var head_count = _head_count;

	var cylinders = [];

	function clear() {
		cylinders.splice(0, cylinders.length);
	}

	function add_cyl() {
		var cyl = {};
		for ( var head_index = 0; head_index < head_count; head_index++ ) {
			cyl[ head_index ] = new TrackData();
		}
		cylinders.push(cyl);
		return cyl;
	}

	function get_track( cyl_index, head_index ) {
		if ( cyl_index < 0 || head_index < 0 ) {
			return null;
		}

		if ( cyl_index < cylinders.length && head_index < head_count ) {
			return cylinders[ cyl_index ][ head_index ];
		}
		else {
			return null;
		}
	}
}

function TrackData() {
	// public
	this.get_sec_count = function() { return sectors.length; }
	this.clear = clear; // function();
	this.add_sector = add_sector; // function( sector );
	this.get_sector = get_sector; // function( index );

	// private
	var sectors = [];

	function clear() {
		sectors.splice(0, sectors.length);
	}

	function add_sector( sector ) {
		sectors.push(sector);
	}

	function get_sector( index ) {
		if ( index < sectors.length ) {
			return sectors[ index ];
		}
		else {
			return null;
		}
	}
}


function SectorData( _cyl_byte, _head_byte, _sec_byte, _length_byte, _deleted ) {
	// public
	this.get_cyl_byte = function() { return cyl_byte; }
	this.get_head_byte = function() { return head_byte; }
	this.get_sec_byte = function() { return sec_byte; }
	this.get_length_byte = function() { return length_byte; }
	this.get_flags = function() { return flags; }
	this.get_data_byte = get_data_byte; // function( index );
	this.set_data_byte = set_data_byte; // function( index, value );
	this.is_deleted = function( value ) { 
		if ( value !== undefined ) {
			if ( value ) {
				flags |= 0x80;
			}
			else {
				flags &= 0x7f;
			}
		}
		else {
			return !!( flags & 0x80 ); 
		}
	}

	// private
	var cyl_byte = _cyl_byte;
	var head_byte = _head_byte;
	var sec_byte = _sec_byte;
	var length_byte = _length_byte;

	// if ( length_byte < 0 || length_byte > 3 ) {
	// 	throw new Error('Incorrect sector length');
	// }

	var flags = 0; // as FDI flags
	if ( _deleted ) {
		flags |= 0x80;
	}

	switch ( length_byte ) {
		case SectorData.SEC_LENGTH_0x0080: flags |= 0x01; break;
		case SectorData.SEC_LENGTH_0x0100: flags |= 0x02; break;
		case SectorData.SEC_LENGTH_0x0200: flags |= 0x04; break;
		case SectorData.SEC_LENGTH_0x0400: flags |= 0x08; break;
	}

	var data = []; // sector data bytes

	function get_data_byte( index ) {
		if ( is_data_index_valid(index) ) {
			return data[ index ] || 0;
		}
		else {
			throw new Error('The data index is out of range');
		}
	}

	function set_data_byte( index, value ) {
		if ( is_data_index_valid(index) ) {
			data[ index ] = value;
		}
		else {
			throw new Error('The data index is out of range');
		}
	}

	function is_data_index_valid( index ) {
		if ( isNaN(index) || index < 0 ) {
			return false;
		}

		return ( index < ( 0x0080 << length_byte ));
	}
}
SectorData.SEC_LENGTH_0x0080 = 0;
SectorData.SEC_LENGTH_0x0100 = 1;
SectorData.SEC_LENGTH_0x0200 = 2;
SectorData.SEC_LENGTH_0x0400 = 3;


DiskImage.createFromTRD = function( trd_data ) {

	// UNDONE: имя диска из служебного сектора можно использовать как комментарий

	if ( !trd_data || !trd_data.length ) {
		throw new Error('Wrong TRD data');
	}

	var cyl_count = 0;
	var head_count = 0;

	// определяем конфигурацию диска из служебной информации
	switch ( trd_data[0x08e3] ) {
		case 0x16: cyl_count = 80; head_count = 2; break;
		case 0x17: cyl_count = 40; head_count = 2; break;
		case 0x18: cyl_count = 80; head_count = 1; break;
		case 0x19: cyl_count = 40; head_count = 1; break;

		// если служебная информация некорректная, то пытаемся определить
		// конфигурацию исходя из размера файла
		default:
			switch ( trd_data.length ) {
				case 655360: cyl_count = 80; head_count = 2; break;
				case 327680: cyl_count = 80; head_count = 1; break;
				case 163840: cyl_count = 40; head_count = 1; break;

				// если и размер нестандартный, то бросаем исключение
				default: throw new Error('Unknown TRD disk type');
			}
			break;
	}

	var image = new DiskImage(head_count, false, '', '');

	var data_index = 0;
	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		var cyl = image.add_cyl();
		for ( var head_index = 0; head_index < head_count; head_index++ ) {
			for ( var sec_index = 0; sec_index < 16; sec_index++ ) {
				var cyl_byte = cyl_index;
				var head_byte = head_index;
				var sec_byte = sec_index + 1;
				var length_byte = SectorData.SEC_LENGTH_0x0100;

				var sec = new SectorData(cyl_byte, head_byte, sec_byte, length_byte, false);
				for ( var sec_data_index = 0; sec_data_index < 256; sec_data_index++ ) {
					sec.set_data_byte(sec_data_index, trd_data[ data_index ]);
					data_index++;
				}

				cyl[ head_index ].add_sector(sec);
			}
		}
	}

	return image;
}

DiskImage.createFromFDI = function( fdi_data ) {
	if ( !fdi_data || fdi_data.length < 14 || fdi_data[0] != 0x46 /*F*/ || fdi_data[1] != 0x44 /*D*/ || fdi_data[2] != 0x49 /*I*/ ) {
		throw new Error('Wrong FDI data');
	}

	var write_protect = ( fdi_data[3] != 0 );
	var cyl_count = (( fdi_data[5] << 8 ) | fdi_data[4] );
	var head_count = (( fdi_data[7] << 8 ) | fdi_data[6] );
	var comment_offset = (( fdi_data[9] << 8 ) | fdi_data[8] );
	var data_offset = (( fdi_data[11] << 8 ) | fdi_data[10] );
	var extra_header_length = (( fdi_data[13] << 8 ) | fdi_data[12] );
	var extra_header_offset = 14;
	var track_header_offset = ( extra_header_offset + extra_header_length );

	var comment = '';
	while ( comment_offset < fdi_data.length && fdi_data[comment_offset] != 0 ) {
		comment += String.fromCharCode(fdi_data[comment_offset]);
		comment_offset++;
	}

	var image = new DiskImage(head_count, write_protect, '', comment);

	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		var cyl = image.add_cyl();
		for ( var head_index = 0; head_index < head_count; head_index++ ) {
			var track_data_offset = (
				data_offset + 
				( fdi_data[ track_header_offset + 3 ] << 24 ) +
				( fdi_data[ track_header_offset + 2 ] << 16 ) +
				( fdi_data[ track_header_offset + 1 ] << 8 ) +
				( fdi_data[ track_header_offset + 0 ] << 0 )
			);

			var sec_count = fdi_data[ track_header_offset + 6 ];
			for ( var sec_index = 0; sec_index < sec_count; sec_index++ ) {
				var sec_header_offset = track_header_offset + 7 + ( sec_index * 7 );

				var cyl_byte =    fdi_data[ sec_header_offset + 0 ];
				var head_byte =   fdi_data[ sec_header_offset + 1 ];
				var sec_byte =    fdi_data[ sec_header_offset + 2 ];
				var length_byte = fdi_data[ sec_header_offset + 3 ];
				var flags =       fdi_data[ sec_header_offset + 4 ];

				var sec_data_offset = ( 
					track_data_offset + 
					( fdi_data[ sec_header_offset + 6 ] << 8 ) +
					fdi_data[ sec_header_offset + 5 ]
				);

				var sec_length = ( 0x0080 << length_byte );

				var sec = new SectorData(cyl_byte, head_byte, sec_byte, length_byte, flags & 0x80);
				for ( var sec_data_index = 0; sec_data_index < sec_length; sec_data_index++ ) {
					sec.set_data_byte(sec_data_index, fdi_data[ sec_data_offset ]);
					sec_data_offset++;
				}

				cyl[ head_index ].add_sector(sec);
			}

			// передвигаем смещение на следующий заголовок дорожки
			track_header_offset += ( 7 + ( 7 * sec_count ));
		}
	}

	return image;
}

DiskImage.createFromSCL = function( scl_data ) {

	// UNDONE: не проверяется контрольная сумма файла

	if (!scl_data || 
		scl_data.length < 9 || 
		scl_data[0] != 0x53 /*S*/ ||
		scl_data[1] != 0x49 /*I*/ ||
		scl_data[2] != 0x4e /*N*/ ||
		scl_data[3] != 0x43 /*C*/ ||
		scl_data[4] != 0x4c /*L*/ ||
		scl_data[5] != 0x41 /*A*/ ||
		scl_data[6] != 0x49 /*I*/ ||
		scl_data[7] != 0x52 /*R*/ ) {

		throw new Error('Wrong SCL data');
	}

	var image = new DiskImage(2, false, '', '');
	var cur_cyl = null;
	var cur_cyl_index = -1;
	var cur_head = 0;

	function get_next_track() {
		if ( cur_cyl_index < 0 || cur_head == 1 ) {
			cur_cyl = image.add_cyl();
			cur_cyl_index++;
			cur_head = 0;
		}
		else {
			cur_head = 1;
		}

		var track = cur_cyl[ cur_head ];

		for ( var sec_byte = 1; sec_byte <= 16; sec_byte++ ) {
			track.add_sector(new SectorData(cur_cyl_index, cur_head, sec_byte, SectorData.SEC_LENGTH_0x0100, false));
		}

		return track;
	}

	var catalog_track = get_next_track();
	var catalog_sec_index = 0;
	var catalog_sec_data_index = 0;

	var data_track = get_next_track();
	var data_track_index = ( cur_cyl_index * 2 + cur_head );
	var data_sec_index = 0;

	var file_count = scl_data[8];
	var file_header_offset = 9;
	var file_data_offset = ( file_header_offset + ( file_count * 14 ));

	for ( var file_index = 0; file_index < file_count; file_index++ ) {
		// получаем длину файла в секторах
		var file_sec_count = scl_data[ file_header_offset + 13 ];

		// копируем заголовок в каталог
		var catalog_sec = catalog_track.get_sector(catalog_sec_index);
		for ( var i = 0; i < 14; i++ ) {
			catalog_sec.set_data_byte(catalog_sec_data_index, scl_data[ file_header_offset ]);

			catalog_sec_data_index++;
			file_header_offset++;
		}
		// кроме того, добавляем в каталог номер дорожки и номер сектора, где будет храниться файл
		catalog_sec.set_data_byte(catalog_sec_data_index, data_sec_index);
		catalog_sec_data_index++;		
		catalog_sec.set_data_byte(catalog_sec_data_index, data_track_index);
		catalog_sec_data_index++;

		// проверяем, не нужно ли переключиться на следующий сектор в каталоге
		if ( catalog_sec_data_index >= 0x0100 ) {
			catalog_sec_index++;
			catalog_sec_data_index = 0;

			// TR-DOS каталог занимает максимум 8 секторов (в 9-м идет служебная информация)
			if ( catalog_sec_index >= 8 ) {
				throw new Error('Too many files');
			}
		}

		// копируем данные файла
		for ( var file_sec_index = 0; file_sec_index < file_sec_count; file_sec_index++ ) {
			var data_sec = data_track.get_sector(data_sec_index);

			for ( var i = 0; i < 256; i++ ) {
				data_sec.set_data_byte(i, scl_data[ file_data_offset ]);

				file_data_offset++;
			}

			// переключаемся на следующий сектор / дорожку
			data_sec_index++;
			if ( data_sec_index == 16 ) {
				data_track = get_next_track();
				data_track_index = ( cur_cyl_index * 2 + cur_head );
				data_sec_index = 0;
			}
		}
	}

	// заполняем служебную информацию
	var first_free_track = data_track_index;
	var first_free_sec = data_sec_index;
	var free_sec_count = (160 - first_free_track) * 16 - data_sec_index;

	var serv_sector = catalog_track.get_sector(8);
	serv_sector.set_data_byte(0x00, 0x00); // признак конца каталога
	serv_sector.set_data_byte(0xe1, first_free_sec); // первый свободный сектор
	serv_sector.set_data_byte(0xe2, first_free_track); // первая свободная дорожка
	serv_sector.set_data_byte(0xe3, 0x16); // дискета с 80-ю цилиндрами и двумя сторонами
	serv_sector.set_data_byte(0xe4, file_count); // количество всех (вместе с удаленными) файлов
	serv_sector.set_data_byte(0xe5, free_sec_count & 0xff ); // количество свободных секторов - младший байт
	serv_sector.set_data_byte(0xe6, free_sec_count >> 8 ); // --//-- - старший байт
	serv_sector.set_data_byte(0xe7, 0x10); // код TR-DOS'а
	serv_sector.set_data_byte(0xf4, 0x00); // количество удаленных файлов
	for ( var i = 0xf5; i <= 0xff; i++ ) {
		serv_sector.set_data_byte(i, 0x20); // имя диска
	}

	// дополняем диск до 160 дорожек
	while ( data_track_index < 159 ) {
		data_track = get_next_track();
		data_track_index = ( cur_cyl_index * 2 + cur_head );
	}

	return image;
}

DiskImage.createCustomImage = function ( cyl_count, head_count, trdos_format ) {
	var image = new DiskImage(head_count, false, '', '');
	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		image.add_cyl();
	}

	if ( trdos_format ) {
		for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
			for ( var head_index = 0; head_index < head_count; head_index++ ) {

				var track = image.get_track(cyl_index, head_index);
				for ( var sec_byte = 1; sec_byte <= 16; sec_byte++ ) {
					var sector = new SectorData(cyl_index, head_index, sec_byte, SectorData.SEC_LENGTH_0x0100, false);
					track.add_sector(sector);
				}
			}
		}

		var cat_track = image.get_track(0, 0);
		if ( cat_track ) {
			var serv_sector = cat_track.get_sector(8);

			serv_sector.set_data_byte(0x00, 0x00); // признак конца каталога
			serv_sector.set_data_byte(0xe1, 0); // первый свободный сектор
			serv_sector.set_data_byte(0xe2, 1); // первая свободная дорожка

			if ( cyl_count < 80 ) {
				serv_sector.set_data_byte(0xe3, head_count == 2 ? 0x17 : 0x19); // дискета с 40 цилиндрами
			}
			else {
				serv_sector.set_data_byte(0xe3, head_count == 2 ? 0x16 : 0x18); // дискета с 80 цилиндрами
			}

			serv_sector.set_data_byte(0xe4, 0); // количество всех (вместе с удаленными) файлов

			var free_sec_count = ( cyl_count * head_count - 1 ) * 16; // одна дорожка уходит под каталог
			serv_sector.set_data_byte(0xe5, free_sec_count & 0xff ); // количество свободных секторов - младший байт
			serv_sector.set_data_byte(0xe6, free_sec_count >> 8 ); // --//-- - старший байт
			
			serv_sector.set_data_byte(0xe7, 0x10); // код TR-DOS'а
			serv_sector.set_data_byte(0xf4, 0); // количество удаленных файлов
			for ( var i = 0xf5; i <= 0xff; i++ ) {
				serv_sector.set_data_byte(i, 0x20); // имя диска
			}
		}
	}

	return image;
}

DiskImage.getCompatibleFormats = function ( image ) {
	var formats = [];

	formats.push('fdi');

	var trdos_compatible = true;
	var cyl_count = image.get_cyl_count();
	var head_count = image.get_head_count();

	for ( var cyl_index = 0; trdos_compatible && cyl_index < cyl_count; cyl_index++ ) {
		for ( var head_index = 0; trdos_compatible && head_index < head_count; head_index++ ) {

			var track = image.get_track(cyl_index, head_index);
			var sec_count = track.get_sec_count();
			if ( sec_count == 16 ) {
				for ( var sec_index = 0; trdos_compatible && sec_index < 16; sec_index++ ) {
					var sector = track.get_sector(sec_index);
					if ( sector.get_length_byte() != SectorData.SEC_LENGTH_0x0100 ) {
						trdos_compatible = false;
					}
				}
			}
			else {
				trdos_compatible = false;
			}
		}
	}

	if ( trdos_compatible ) {
		formats.push('scl');

		if ( cyl_count == 40 || cyl_count == 80 ) {
			formats.push('trd');
		}
	}

	return formats;
}

DiskImage.saveToTRD = function ( image ) {
	var compatible = false;
	var formats = DiskImage.getCompatibleFormats(image);
	for ( var i = 0; i < formats.length; i++ ) {
		if ( formats[i] == 'trd' ) {
			compatible = true;
		}
	}
	if ( !compatible ) {
		return null;
	}

	var trd_data = [];

	var cyl_count = image.get_cyl_count();
	var head_count = image.get_head_count();

	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		for ( var head_index = 0; head_index < head_count; head_index++ ) {

			var track = image.get_track(cyl_index, head_index);
			for ( var sec_index = 0; sec_index < 16; sec_index++ ) {
				var sector = track.get_sector(sec_index);
				for ( var i = 0; i < 0x0100; i++ ) {
					trd_data.push(sector.get_data_byte(i));
				}
			}
		}
	}

	return trd_data;
}

DiskImage.saveToFDI = function ( image ) {
	var compatible = false;
	var formats = DiskImage.getCompatibleFormats(image);
	for ( var i = 0; i < formats.length; i++ ) {
		if ( formats[i] == 'fdi' ) {
			compatible = true;
		}
	}
	if ( !compatible ) {
		return null;
	}

	var cyl_count = image.get_cyl_count();
	var head_count = image.get_head_count();

	var fdi_data = [];

	// записиываем FDI-заголовок
	fdi_data.push(0x46); // 'F'
	fdi_data.push(0x44); // 'D'
	fdi_data.push(0x49); // 'I'
	fdi_data.push(image.is_write_protected() ? 1 : 0);
	fdi_data.push(( cyl_count >> 0 ) & 0xff );
	fdi_data.push(( cyl_count >> 8 ) & 0xff );
	fdi_data.push(( head_count >> 0 ) & 0xff );
	fdi_data.push(( head_count >> 8 ) & 0xff );
	fdi_data.push(0); // смещение текста (L)
	fdi_data.push(0); // смещение текста (H)
	fdi_data.push(0); // смещение данных (L)
	fdi_data.push(0); // смещение данных (H)
	fdi_data.push(0); // длина расширения заголовка (L)
	fdi_data.push(0); // длина расширения заголовка (H)

	// записываем заголовки секторов
	var track_data_offset = 0x00000000;
	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		for ( var head_index = 0; head_index < head_count; head_index++ ) {
			fdi_data.push(( track_data_offset >> 0 ) & 0xff );
			fdi_data.push(( track_data_offset >> 8 ) & 0xff );
			fdi_data.push(( track_data_offset >> 16 ) & 0xff );
			fdi_data.push(( track_data_offset >> 24 ) & 0xff );
			fdi_data.push(0);
			fdi_data.push(0);

			var track = image.get_track(cyl_index, head_index);
			var sec_count = track.get_sec_count();

			fdi_data.push(sec_count);

			var sector_data_offset = 0x0000;
			for ( var sec_index = 0; sec_index < sec_count; sec_index++ ) {
				var sector = track.get_sector(sec_index);

				fdi_data.push(sector.get_cyl_byte());
				fdi_data.push(sector.get_head_byte());
				fdi_data.push(sector.get_sec_byte());
				fdi_data.push(sector.get_length_byte());
				fdi_data.push(sector.get_flags());
				fdi_data.push(( sector_data_offset >> 0 ) & 0xff );
				fdi_data.push(( sector_data_offset >> 8 ) & 0xff );

				var sector_length = ( 0x0080 << sector.get_length_byte() );
				sector_data_offset += sector_length;
			}

			track_data_offset += sector_data_offset;
		}
	}

	// сохраняем смещение текста
	fdi_data[ 0x08 ] = (( fdi_data.length >> 0 ) & 0xff );
	fdi_data[ 0x09 ] = (( fdi_data.length >> 8 ) & 0xff );

	var desc = '\0';
	var desc_data = string_to_bytes(desc);
	for ( var i = 0; i < desc_data.length; i++ ) {
		fdi_data.push(desc_data[i]);
	}

	// сохраняем смещение данных
	fdi_data[ 0x0a ] = (( fdi_data.length >> 0 ) & 0xff );
	fdi_data[ 0x0b ] = (( fdi_data.length >> 8 ) & 0xff );

	// записываем данные секторов
	for ( var cyl_index = 0; cyl_index < cyl_count; cyl_index++ ) {
		for ( var head_index = 0; head_index < head_count; head_index++ ) {
			var track = image.get_track(cyl_index, head_index);
			var sec_count = track.get_sec_count();
			for ( var sec_index = 0; sec_index < sec_count; sec_index++ ) {
				var sector = track.get_sector(sec_index);
				var sector_length = ( 0x0080 << sector.get_length_byte() );
				for ( var i = 0; i < sector_length; i++ ) {
					fdi_data.push(sector.get_data_byte(i));
				}
			}
		}
	}

	return fdi_data;
}

DiskImage.saveToSCL = function ( image ) {
	var compatible = false;
	var formats = DiskImage.getCompatibleFormats(image);
	for ( var i = 0; i < formats.length; i++ ) {
		if ( formats[i] == 'scl' ) {
			compatible = true;
		}
	}
	if ( !compatible ) {
		return null;
	}

	var scl_data = [];

	// записываем SCL-заголовок
	scl_data.push(0x53); /*S*/
	scl_data.push(0x49); /*I*/
	scl_data.push(0x4e); /*N*/
	scl_data.push(0x43); /*C*/
	scl_data.push(0x4c); /*L*/
	scl_data.push(0x41); /*A*/
	scl_data.push(0x49); /*I*/
	scl_data.push(0x52); /*R*/

	var cat_track = image.get_track(0, 0);
	if ( cat_track ) {
		// считаем количество неудаленных файлов
		var file_count = 0;
		var sec_index = 0;
		var sec_offset = 0;
		while ( sec_index < 8 ) {
			var sector = cat_track.get_sector(sec_index);
			// проверяем первый байт имени файла
			var filename_byte = sector.get_data_byte(sec_offset);
			if ( filename_byte == 0x00 ) {
				// конец каталога
				break;
			}

			if ( filename_byte != 0x01 ) {
				// если файл не удален, то учитываем его
				file_count++;
			}

			// переходим к следующему файлу
			sec_offset += 16;
			if ( sec_offset == 256 ) {
				sec_index++;
				sec_offset = 0;
			}
		}

		// записываем количество файлов
		scl_data.push(file_count);


		// сохраняем по 14 байт из заголовка для всех неудаленных файлов
		sec_index = 0;
		sec_offset = 0;
		while ( sec_index < 8 ) {
			var sector = cat_track.get_sector(sec_index);
			// проверяем первый байт имени файла
			var filename_byte = sector.get_data_byte(sec_offset);
			if ( filename_byte == 0x00 ) {
				// конец каталога
				break;
			}

			if ( filename_byte != 0x01 ) {
				// если файл не удален, то копируем 14 байт его заголовка
				for ( var i = 0; i < 14; i++ ) {
					scl_data.push(sector.get_data_byte(sec_offset + i));
				}
			}

			// переходим к следующему файлу
			sec_offset += 16;
			if ( sec_offset == 256 ) {
				sec_index++;
				sec_offset = 0;
			}
		}


		// сохраняем данные всех неудаленных файлов
		sec_index = 0;
		sec_offset = 0;
		while ( sec_index < 8 ) {
			var sector = cat_track.get_sector(sec_index);
			// проверяем первый байт имени файла
			var filename_byte = sector.get_data_byte(sec_offset);
			if ( filename_byte == 0x00 ) {
				// конец каталога
				break;
			}

			if ( filename_byte != 0x01 ) {
				// если файл не удален, то копируем его данные
				var data_sec_count = sector.get_data_byte(sec_offset + 13);
				var data_sec_index = sector.get_data_byte(sec_offset + 14);
				var data_trk_index = sector.get_data_byte(sec_offset + 15);

				while ( data_sec_count ) {
					var data_cyl_index = Math.floor(data_trk_index / image.get_head_count());
					var data_head_index = data_trk_index - ( data_cyl_index * image.get_head_count());
					var data_track = image.get_track(data_cyl_index, data_head_index);
					var data_sector = data_track.get_sector(data_sec_index);
					for ( var i = 0; i < 0x0100; i++ ) {
						fdi_data.push(data_sector.get_data_byte(i));
					}

					data_sec_index++;
					if ( data_sec_index == 16 ) {
						data_trk_index++;
						data_sec_index = 0;
					}
					data_sec_count--;
				}
			}

			// переходим к следующему файлу
			sec_offset += 16;
			if ( sec_offset == 256 ) {
				sec_index++;
				sec_offset = 0;
			}			
		}
	}
	else {
		// записываем количество файлов
		scl_data.push(0);
	}

	// считаем и записываем контрольную сумму
	var sum_hi_word = 0x0000;
	var sum_lo_word = 0x0000;
	for ( var i = 0; i < scl_data.length; i++ ) {
		sum_lo_word += scl_data[i];
		if ( sum_lo_word > 0xffff ) {
			sum_lo_word &= 0xffff;
			sum_hi_word = ( sum_hi_word + 1 ) & 0xffff;
		}
	}

	scl_data.push(( sum_lo_word >> 0 ) & 0xff );
	scl_data.push(( sum_lo_word >> 8 ) & 0xff );
	scl_data.push(( sum_hi_word >> 0 ) & 0xff );
	scl_data.push(( sum_hi_word >> 8 ) & 0xff );

	return scl_data;
}