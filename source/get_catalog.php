<?php
	$files_folder = 'zx_files';
	$types = array('trd', 'fdi', 'scl');

	$result = array();

	foreach ( $types as $type ) {
		$type_folder = $files_folder . '/' . $type;
		$files = glob($type_folder . '/*.' . $type);
		$metafile = $type_folder . '/meta.xml';

		$meta_info_parser = new MetaInfoParser();

		if ( file_exists($metafile) ) {
			$meta_data = file_get_contents($metafile);
			$meta_info_parser->parse($meta_data);
		}

		foreach ( $files as $file ) {
			$name = preg_replace('/.*[\\\\\\/]/', '', $file);
			$file_info = null;

			foreach ( $meta_info_parser->images as $image ) {
				if ( $image['name'] == $name ) {
					$file_info = $image;
					break;
				}
			}

			$result[] = array(
				'type' => $type,
				'name' => $name,
				'description' => $file_info ? $file_info['description'] : '',
				'tags' => $file_info ? $file_info['tags'] : array()
			);
		}
	}

	echo json_encode($result);

	class MetaInfoParser {
		var $parser;
		var $images = array();
		var $current_image = null;

		var $depth = array();

		function MetaInfoParser() {
			$this->parser = xml_parser_create();

			xml_set_object($this->parser, $this);
			xml_parser_set_option($this->parser, XML_OPTION_CASE_FOLDING, 0);
			xml_set_element_handler($this->parser, 'on_tag_open', 'on_tag_close');
			xml_set_character_data_handler($this->parser, 'on_data');
		}

		function parse( $data ) {
			xml_parse($this->parser, $data);
		}

		function clear() {
			$this->images = array();
		}

		function cur_tag() {
			if ( count($this->depth) > 0 ) {
				return $this->depth[ count($this->depth) - 1 ];
			}
			else {
				return null;
			}
		}

		function on_tag_open( $parser, $name, $attrs ) {
			$this->depth[] = $name;

			if ( $name == 'image' && count($this->depth) == 2 ) {
				$this->current_image = array(
					'name' => '',
					'description' => '',
					'tags' => array()
				);				
			}
		}

		function on_tag_close( $parser, $name ) {
			if ( $this->cur_tag() == $name ) {
				if ( $name == 'image' && count($this->depth) == 2 ) {
					$this->images[] = $this->current_image;
					$this->current_image = null;
				}

				array_pop($this->depth);
			}
		}

		function on_data( $parser, $data ) {
			if ( $this->current_image && count($this->depth) == 3 ) {
				switch ( $this->cur_tag() ) {
					case 'name': $this->current_image['name'] .= $data; break;
					case 'description': $this->current_image['description'] .= $data; break;
					case 'tag': $this->current_image['tags'][] = $data; break;
				}
			}
		}

	}
?>