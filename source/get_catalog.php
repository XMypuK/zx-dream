<?php
	$files_folder = 'zx_files';
	$types = array('trd', 'fdi', 'scl');

	$result = array();

	foreach ( $types as $type ) {
		$type_folder = $files_folder . '/' . $type;
		$files = glob($type_folder . '/*.' . $type);
		$metafile = $type_folder . '/meta.xml';

		$sxMeta = simplexml_load_file($metafile);

		foreach ( $files as $file ) {
			$name = preg_replace('/.*[\\\\\\/]/', '', $file);
			$sxImage = $sxMeta->xpath('/meta/image[name/text()="' . $name  . '"]');
			$description = !is_null($sxImage) ? $sxImage[0]->xpath('description/text()')[0] : '';
			$tags = !is_null($sxImage) ? array_map(
			    fn($value): string => $value, 
			    $sxImage[0]->xpath('tag/text()')
			) : array();

			$result[] = array(
				'type' => $type,
				'name' => $name,
				'description' => $description,
				'tags' => $tags
			);
		}
	}

	echo json_encode($result);
?>