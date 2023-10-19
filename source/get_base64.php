<?php
	// Возвращает данные файла с сервера либо переданные двоичные данные, перекодированные в base64.
	//
	// В случае запроса файла через get-параметр type передается тип файла (rom, trd, fdi и т.п.), а
	// через get-параметр name передается имя запрашиваемого файла.
	//
	// В случае запроса на перекодирование бинарных данных get-параметр input должен содержать имя
	// файлового поля, через которое передаются бинарные данные.

	$data = '';

	if ( isset($_GET['input']) ) {
		$field_name = $_GET['input'];
		if ( isset($_FILES[$field_name]) && $_FILES[$field_name]['name'] != '' && $_FILES[$field_name]['size'] != 0 ) {
			$data = file_get_contents($_FILES[$field_name]['tmp_name']);
			unlink($_FILES[$field_name]['tmp_name']);
		}
	}
	else if ( isset($_GET['type']) && isset($_GET['name']) ) {
		$type = strtolower($_GET['type']);
		$name = $_GET['name'];

		if ( !preg_match("/(^|[\/\\\\])\\.{2}/", $name) ) {
			switch ( $type ) {
				case 'rom':
				case 'trd':
				case 'fdi':
				case 'scl':
					$path = 'zx_files/' . $type . '/' . str_replace('\\', '/', $name);
					if ( file_exists($path) ) {
						$data = file_get_contents($path);
					}
					break;
			}
		}
	}

	echo base64_encode($data);

	// проверка алгоритма преобразования бинарных данных в escape-строку
	// $test = "\x00\x38\x8b\xfe";
	// $bytes = unpack('C*', $test);
	// foreach ($bytes as $byte) {
	// 	printf('\\x%02x', $byte);
	// }
?>