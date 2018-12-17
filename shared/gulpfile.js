const gulp = require('gulp');
const ts = require('gulp-typescript');

// pull in the project TypeScript config
const tsProject = ts.createProject('tsconfig.json');

gulp.task('scripts', function () {
	const tsResult = tsProject.src()
		.pipe(tsProject());
	return tsResult.js.pipe(gulp.dest('.'));
});

gulp.task('watch', gulp.series('scripts', function () {
	gulp.watch('./src/**/*.ts', gulp.series('scripts'));
}));

gulp.task('default', gulp.series('watch'));

gulp.task('build', gulp.series('scripts'));
