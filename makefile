ajaxmin=java -jar utils\compiler.jar --compilation_level SIMPLE_OPTIMIZATIONS
xcopy=xcopy /Y /E
copy=copy /Y
mod_compile=utils\html2js_css -jd "publish\js" -cd "publish\css"

COMPILE_DIRS="publish" "publish\img" "publish\css" "publish\js" "publish\zx_files"

.PHONY: clean compile

all: clean compile

clean:
	if exist "publish" ( rmdir /S /Q "publish" )

compile: clean $(COMPILE_DIRS) .COPY_JS .COPY_CSS .COMPILE_MODULES .MINIFY_JS
	$(copy) "source\js\jquery*" "publish\js\"
	$(xcopy) "source\img\*.*" "publish\img\"
	$(xcopy) "source\zx_files\*.*" "publish\zx_files\"
	$(copy) "source\*.html" "publish\"
	$(copy) "source\*.php" "publish\"

$(COMPILE_DIRS): ; mkdir $@
.COPY_JS: ; $(xcopy) "source\js\*.*" "publish\js\"
.COPY_CSS: ; $(xcopy) "source\css\*.*" "publish\css\"
.COMPILE_MODULES:
	$(mod_compile) -bd "source\modules" "source\modules\spectrum.html"

.MINIFY_JS:
	$(ajaxmin) --js publish\js\spectrum.js --js_output_file publish\js\spectrum.min.js