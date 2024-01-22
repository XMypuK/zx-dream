# ZX-Dream
[Русский](#russian)  
[English](#english)  

----------

## Russian

Эмулятор ZX Spectrum на JavaScript

Реализована эмуляция следующего оборудования:

- процессор Z80 (включая большинство недокументированных особенностей)
- ПЗУ с переключением страниц 48/Turbo/128/TR-DOS
- ОЗУ общим объемом 512 Кб, реализованное по схеме Pentagon (через порт #7FFD)
- интерфейс Beta Disk
- дисплей с возможностью переключения отображения из 5 или 7 страницы памяти (через порт #7FFD)
- 40-клавишная клавиатура
- Kempston-мышка (с виртуальным управлением)
- Музыкальный сопроцессор AY-3-891x/YM2149 (+ Бипер, + Turbo Sound) (Требуется производительная система. Рекомендуются Edge или Chrome.)

Другие возможности:

- открытие и сохранение образов в форматах TRD, FDI, SCL, TD0, UDI
- открытие снимков SNA, Z80
- сохранение снимков SNA
- выбор способа отрисовки ( *putImageData*, *drawImage*, *WebGL* ) и масштабирования
- выбор способа вывода звука ( *ScriptProcessorNode*, *WorkletNode* )
- вариант запуска эмуляции в отдельном потоке


Вы можете взглянуть на эмулятор здесь: [ZX Spectrum online emulator](https://zx.researcher.su/)

### Формат исходных файлов

Исходный код эмулятора находится в папке *modules*. Часть файлов имеет расширение *html*, но на самом деле являются
модулями, которые могут содержать HTML-шаблоны, CSS-стили к этим шаблонам и JS-код, необходимые для обеспечения
соответствующей функциональности. Также модули могут включать в себя другие модули. При сборке весь результирующий
код оказывается в следующих файлах: 
- *css\spectrum.css* - все стили, используемые модулями;
- *js\spectrum.js* - эмулятор для исполнения в основном потоке;
- *js\spectrum_hw.js* - эмулятор, выполняемый в выделенном потоке;
- *js\spectrum_ui.js* - пользовательский интерфейс эмулятора, выполняемого в выделенном потоке;
- *js\spectrum_audio.js* - аудио-процессор, используемый при выводе звука в отдельном потоке через WorkletNode;
- *js\loader.js* - загрузчик.

### Сборка

Для сборки необходимо наличие на компьютере командной оболочки PowerShell 2.0. Если на компьютере установлена среда
выполнения Java, то также будет произведена минификация JS-кода. Чтобы выполнить сборку,
необходимо выполнить файл *build.cmd* в корне проекта. (Возможно, понадобится ещё разрешить выполнение скиптов 
PowerShell, выполнив в оболочке команду: *Set-ExecutionPolicy -ExecutionPolicy RemoteSigned*.)


## English

ZX Spectrum emulator in JavaScript

The next hardware emulation was implemented:

- processor Z80 (including most of the undocumented features)
- ROM with page switching 48/Turbo/128/TR-DOS
- RAM with the total amount of 512 KB. Implemented according to the Pentagon scheme (via the port #7FFD)
- Beta Disk interface
- display with the capability to switch the source memory page: 5 or 7 (via the port #7FFD)
- 40-key keyboard
- Kempston-mouse (virtual control)
- Programmable sound generator AY-3-891x/YM2149 (+ Beeper, + Turbo Sound) (Requires high performance system. Edge or Chrome are recommended.)

Other capabilities:

- open and save images in TRD, FDI, SCL, TD0, UDI formats
- open SNA, Z80 snapshots
- save SNA snapshots
- select the rendering method ( *putImageData*, *drawImage*, *WebGL* ) and the scaling method
- audio rendering with different methods ( *ScriptProcessorNode*, *WorkletNode* )
- option to run emulation in the dedicated thread

You can take a look at the emulator here: [ZX Spectrum online emulator](https://zx.researcher.su/)

### Source file format

The emulator source code is placed in the *modules* directory. A part of the files has *html* extension, but 
actually these files have the module format. Modules can contain HTML-template, CSS-styles and JS-code required for 
supporting the corresponding functionality. Also modules can include the other ones. While the build process is 
being performed the entire result code goes into the next files:
- *css\spectrum.css* - all the styles used by modules;
- *js\spectrum.js* - an emulator running in the main thread;
- *js\spectrum_hw.js* - an emulator running in a dedicated thread;
- *js\spectrum_ui.js* - UI of dedicated thread emulator;
- *js\spectrum_audio.js* - audio processor used for rendering in the dedicated thread using WorkletNode;
- *js\loader.js* - a loader.

### Build process

To build, the PowerShell 2.0 must be installed. Also JS code will be minified in the case you have
Java runtime environment installed on the computer. In order to build the project, you have to run *build.cmd* 
file that is placed at the top directory. (Probably also the next command must be executed in the shell: 
*Set-ExecutionPolicy -ExecutionPolicy RemoteSigned*.)

## License

This project is under [MIT License](LICENSE)

## Third party projects

<table>
    <tr><th><a href='https://github.com/alexanderk23/ayumi-js'>ayumi-js</a></th><td>Author: Peter Sovietov<br />Javascript version: Alexander Kovalenko</td><td><a href='https://raw.githubusercontent.com/alexanderk23/ayumi-js/master/LICENSE'>MIT license</a></td></tr>
    <tr><th><a href='https://knockoutjs.com/'>Knockout</a></th><td>Copyright (c) 2010 Steven Sanderson, the Knockout.js team, and other contributors</td><td><a href='https://raw.githubusercontent.com/knockout/knockout/master/LICENSE'>MIT license</a></td></tr>
    <tr><th><a href='https://jquery.com/'>jQuery</a></th><td>Copyright OpenJS Foundation and other contributors</td><td><a href='https://raw.githubusercontent.com/jquery/jquery/main/LICENSE.txt'>MIT license</a></td></tr>
</table>
