<?php
	// Перекодирует переданные на сервер base64-данные в бинарный формат
	// и возворащает их как файл для сохранения на диск.
	//
	// $get-параметр input должен содержать имя текстового поля формы, через которое
	// передается base64-строка. $get-параметр name содержит имя, под которых предпочтительно
	// сохранить файл на диске (пользователь может поменять его).
	
	if ( isset($_GET['input']) ) {
		$field_name = $_GET['input'];
		$filename = isset($_GET['name']) ? $_GET['name'] : 'binary';
		if ( isset($_POST[$field_name]) ) {
			$data = base64_decode($_POST[$field_name]);
			header($_SERVER['SERVER_PROTOCOL'] . ' 200 OK');
			header('Content-Type: application/octet-stream');
			header('Content-Length: ' . strlen($data));
			header('Connection: close');
			header('Content-Disposition: attachment; filename="' . $filename . '"');
			echo $data;
			exit();
		}
	}
?>