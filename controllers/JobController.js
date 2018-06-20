var schema = require('../models/schema.js');
var util = require('./util.js');
var formidable = require("formidable");
var XLSX = require("xlsx");

var jobController = {};

/**
 * @url {post} /job/post
 *
 * @description Called when a job is to be created,
 * receives fields from an html form, position and
 * supervisor fields required for a job to be created.
 *
 * @req.body {String} position (Required)
 * @req.body {String} description (only available if position is "Other")
 * @req.body {String} supervisor (Required)
 * @req.body {String} course (not required because RA doesn't have a course connected to it)
 *
 * @success redirects to /job/edit/:_id route (which uses jobController.edit)
 * @failure renders error page with duplicate job message

 * 
 * @throws {Object} RequiredParamNotFound (should not occur if frontend done properly)
 */
jobController.post = function (req, res) {
  var input = req.body;
  input = util.validateModelData(input, schema.Job);
  if(input.position != null && input.supervisor != null){
    //attempt to populate faculty, if they don't exist, error will be caught
    schema.Job.findOne(input).populate("supervisor").exec().then(function(result){
      if(result != null){
        res.render("../views/error.ejs", {string: "This job already exists."});
      }
      else{
        var inputJob = new schema.Job(util.validateModelData(input, schema.Job));
        inputJob.save().then(function(result){
          res.redirect("/job/edit/"+result._id);
        });
      }
    /*this is catching the error if the faculty or course
    provided does not exist (shouldn't occur if frontend
    done properly), and populate is failing*/
    }).catch(function(err){
      res.render("../views/error.ejs", {string: err.message});
    });
    
  }
  else{
    res.render("../views/error.ejs", {string: "Required parameter not found"});
  }
}

/**
 * @url {get} /job
 *
 * @description Called when /job/index.ejs is to be rendered,
 * accepts search fields as an html query
 *
 * @req.query {String} position
 * @req.query {String} description
 * @req.query {String} supervisor (_id)
 * @req.query {String} course (_id)
 *
 * @finish renders /job/index.ejs
 * if no courses are found, then the
 * page indicates that none are found
 */
jobController.get = function (req, res) {
  var input = req.query;
  input = util.validateModelData(input, schema.Job); //remove fields that are empty/not part of job definition
  if(input.position != null){
    input.position = new RegExp(input.position, "i");
  }
  //https://stackoverflow.com/questions/19222520/populate-nested-array-in-mongoose
  schema.Job.find(input).populate("supervisor").populate({path:"course", populate:{path:"semester"}}).populate({path: "semester", options:{sort:{year:1, season:1}}}).exec().then(function (result) {
    var jobs, faculty, courses;
    jobs = result;
    getFaculty().then(function(result){
      faculty = result;
      getCourses().then(function(result){
        courses = result;
        getSemesters().then(function(result){
          res.render("../views/job/index.ejs", {jobs: jobs, faculty: faculty, courses: courses, semesters:result});
        });
      });
    });
  }).catch(function (err) {
    res.json({'error': err.message, 'origin': 'job.get'})
  });
}

/**
 * @url {post} /job/put
 *
 * @description Called when a job is to be updated,
 * field data is sent as an html form, and position,
 * _id, and supervisor are required.
 *
 * @req.body {String} _id (MongoID)
 * @req.body {String} position
 * @req.body {String} description (only available if position is "Other")
 * @req.body {String} supervisor
 * @req.body {String} course
 *
 * @success redirects to /job/edit/:_id (jobController.edit)
 * which displays the newly updated job data
 *
 * @throws {Object} JobNotFound (should not occur if frontend done properly)
 * @throws {Object} RequiredParamNotFound (should not occur if frontend done properly)
 */
jobController.put = function (req, res) {
  var input = req.body;
  input = util.validateModelData(input, schema.Job);
  if(input.position != null && input.supervisor != null && input._id != null){
    schema.Job.findOneAndUpdate({_id: input._id}, input).exec().then(function(result){
      if(result != null){
        res.redirect("/job/edit/"+result._id);
      }
      else{
        throw new Error("JobNotFound");
      }
    }).catch(function(err){
      res.json({"error": err.message, "origin": "job.put"});
    });
  }
  else{
    throw new Error("RequiredParamNotFound");
  }
}

/**
 * @url {post} /job/delete/:_id
 * @class Job
 *
 * @description Called when a job is to be deleted,
 * requires _id, to be sent as a html parameter.
 *
 * @req.params {String} id (Required)
 *
 * @success redirects to /job (jobController.get)
 * @failure renders error.ejs with appropriate error message
 *
 * @throws {Object} JobNotFound (should not occur if frontend done properly)
 * @throws {Object} RequiredParamNotFound (should not occur if frontend done properly)
 */
jobController.delete = function (req, res) {
  var id = req.params._id;
  if (id != null) {
    //students reference jobs, so check if any students are referencing before deleting
    schema.Student.find({jobHistory: id}).exec().then(function(result){
      if(result.length > 0){
        res.render("../views/error.ejs", {string: "Could not delete job because a student is referencing it."})
      }
      else{
        //nothing references this job, so try to delete it
        schema.Job.findOneAndRemove({_id: id}).exec().then(function(result){
          if(result){
            res.redirect("/job");
          }
          else throw new Error("JobNotFound");
        });
      }
    });
  }
  else{
    throw new Error("RequiredParamNotFound");
  }
}

/*
 * @url {get} /job/create
 * 
 * @description renders /job/create.ejs
 *
 */
jobController.create = function(req, res){
  var faculty, courses, jobTitles;
  jobTitles = schema.Job.schema.path("position").enumValues;
  getFaculty().then(function(result){
    faculty = result;
    getCourses().then(function(result){
      courses = result;
      getSemesters().then(function(result){
        res.render("../views/job/create.ejs", {faculty: faculty, courses: courses, jobTitles: jobTitles, semesters: result});
      });
    });
  });
 
}

/**
 * @url {get} /job/edit/:_id
 *
 * @description Called when a job is to be
 * edited by the user. _id is required, and is
 * sent in a html parameter.
 *
 * @param {String} _id (Required)
 *
 * @finish renders job/edit.ejs with the job
 * to be edited
 *
 * @throws {Object} JobNotFound (shouldn't occur if frontend done properly)
 * @throws {Object} RequiredParamNotFound (shouldn't occur if frontend done properly)
 */
jobController.edit = function(req, res){
  if (req.params._id) { //_id from params because passed with job/edit/:_id
    schema.Job.findOne({_id: req.params._id}).populate("supervisor").populate("course").populate("semester").exec().then(function (result) {
      if (result != null) {
        var job, faculty, courses;
        job = result;
        getFaculty().then(function(result){
          faculty = result;
          getCourses().then(function(result){
            courses = result;
            getSemesters().then(function(result){
              res.render("../views/job/edit.ejs", {job: job, faculty: faculty, courses: courses, semesters: result});
            });
          });
        });
      }
      else throw new Error("JobNotFound");
    });
  } else {
    throw new Error("RequiredParamNotFound");
  }
}

jobController.uploadPage = function(req, res){
  var faculty, courses;
  getFaculty().then(function(result){
    faculty = result;
    getCourses().then(function(result){
      courses = result;
      getSemesters().then(function(result){
        res.render("../views/job/upload.ejs", {faculty: faculty, courses: courses, semesters:result});
      });
    });
  });
}

jobController.upload = function(req, res){
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files){
    var f = files[Object.keys(files)[0]];
    var workbook = XLSX.readFile(f.path);
    var worksheet = workbook.Sheets[workbook.SheetNames[0]];
    var headers = {};
    var data = [];
    headers[String.fromCharCode(65)] = "onyen";
    var i = 1;
    for(var field in schema.Job.schema.obj){
      headers[String.fromCharCode(i+65)] = field;
      i++;
    }
    for(z in worksheet) {
        if(z[0] === '!') continue;
        //parse out the column, row, and value
        var col = z.substring(0,1);
        var row = parseInt(z.substring(1));
        var value = worksheet[z].v;

        if(!data[row]) data[row]={};
        data[row][headers[col]] = value;
    }
    //drop those first two rows which are empty
    data.shift();
    data.shift();
    //try to create models
    //have to use foreach because of asynchronous nature of mongoose stuff (the loop would increment i before it could save the appropriate i)
    data.forEach(function(element){
      //verify that required fields exist
      if(element.position != null && element.supervisor != null && element.semester != null){
        //get faculty lastname/firstname
        var commaReg = /\s*,\s*/;
        var facultyName = element.supervisor.split(commaReg);
        facultyName[0] = new RegExp(facultyName[0], "i");
        facultyName[1] = new RegExp(facultyName[1], "i");
        var spaceReg = /\s* \s*/;
        var semester = element.semester.split(spaceReg);
        schema.Faculty.findOne({lastName: facultyName[0], firstName: facultyName[1]}).exec().then(function(result){
          if(result != null){
            element.supervisor = result._id;
            schema.Semester.findOne({season: semester[0].toUpperCase(), year: parseInt(semester[1])}).exec().then(function(result){
              if(result != null){
                element.semester = result._id;
                element.position = element.position.toUpperCase();
                if(element.course != null){
                  var courseInfo = element.course.split(reg); //should be Department, number, section
                  schema.Course.findOne({department: new RegExp(courseInfo[0], "i"), number: courseInfo[1], section: courseInfo[2], faculty: element.supervisor, semester: element.semester}).exec().then(function(result){
                    if(result != null){
                      element.course = result._id;
                      schema.Job.findOne(util.validateModelData(element, schema.Job)).exec().then(function(result){
                        //if the job doesn't exist, try to make it
                        if(result == null){
                          var inputJob = new schema.Job(element);
                          inputJob.save().then(function(result){
                            //save to student's job history
                            pushStudentJob(element.onyen, result._id).then(function(result){}).catch(function(err){
                              res.render("../views/error.ejs", {string:"Student "+element.onyen+" did not save job "+element.position+" because student was not found."});
                            });
                          }).catch(function(err){
                            res.render("../views/error.ejs", {string:element.position+" "+element.supervisor+" did not save because "+err});
                          });
                        }
                        else{
                          pushStudentJob(element.onyen, result._id).then(function(result){}).catch(function(err){
                            res.render("../views/error.ejs", {string:"Student "+element.onyen+" did not save job "+element.position+" because student was not found."});
                          });
                        }
                      });
                    }
                    else{
                      res.render("../views/error.ejs", {string: element.position+" "+element.supervisor+" did not save because the course/faculty/semester is incorrect."});
                    }
                  });
                }
                else{
                  schema.Job.findOne(util.validateModelData(element, schema.Job)).exec().then(function(result){
                    //if the job doesn't exist, try to make it
                    if(result == null){
                      var inputJob = new schema.Job(element);
                      inputJob.save().then(function(result){
                        //save to student's job history
                        pushStudentJob(element.onyen, result._id).then(function(result){}).catch(function(err){
                          res.render("../views/error.ejs", {string:"Student "+element.onyen+" did not save job "+element.position+" because student was not found."});
                        });
                      }).catch(function(err){
                        res.render("../views/error.ejs", {string:element.position+" "+element.supervisor+" did not save because something is wrong with it"});
                      });
                    }
                    else{
                      pushStudentJob(element.onyen, result._id).then(function(result){}).catch(function(err){
                        res.render("../views/error.ejs", {string:"Student "+element.onyen+" did not save job "+element.position+" because student was not found."});
                      });
                    }
                  });
                }
              }
              else{
                res.render("../views/error.ejs", {string: element.position+" "+element.supervisor+" did not save because the semester is incorrect."});
              }
            });
          }
          else{
            res.render("../views/error.ejs", {string: element.position+" "+element.supervisor+" did not save because the faculty is incorrect."});
          }
        });
      }
      else{
        res.render("../views/error.ejs", {string: element.position+" "+element.supervisor+" did not save because it is missing a field."});
      }
    });
    res.redirect("/job/upload"); //quickly redirects, database in background may still be saving courses but don't want to wait for that
  });
}

function pushStudentJob(onyen, jobId){
  return new Promise((resolve, reject)=>{
    schema.Student.findOne({onyen: onyen}).exec().then(function(result){
      if(result != null){

        schema.Student.update({onyen:onyen},{$addToSet: {jobHistory: jobId}}).exec();
        resolve(result);
      }
      else{
        reject(result);
      }
    });
  });
}


jobController.assignPage = function(req, res){
  var jobId = req.params._id;
  if(jobId != null){
    var job, faculty, courses, semesters, students;
    schema.Job.findOne({_id: jobId}).populate("supervisor").populate({path:"course", populate:{path:"semester"}}).populate("semester").exec().then(function(result){
      if(result != null){
        job = result;
        getFaculty().then(function(result){
          faculty = result;
          getCourses().then(function(result){
            courses = result;
            getSemesters().then(function(result){
              semesters = result;
              schema.Student.find().sort({lastName:1, firstName:1}).exec().then(function(result){
                students = result;
                schema.Student.find({jobHistory: jobId}).exec().then(function(result){
                  res.render("../views/job/assign.ejs", {job: job, faculty: faculty, semesters: semesters, courses: courses, students: students, studentsWithJob: result});
                });
              });
            });
          });
        });
      }
      //should not occur during regular website use
      else{
        throw new Error("Job not found");
      }
    });
  }
  else{
    throw new Error("RequiredParamNotFound");
  }
}

jobController.assign = function(req, res){
  var jobId = req.params._id;
  var input = req.body;
  if(jobId != null && input.students != null){
    //make sure the job is in the database
    schema.Job.findOne({_id: jobId}).exec().then(function(result){
      if(result != null){
        console.log(typeof(input.students));
        if(typeof(input.students) == "string"){
          input.students = [input.students];
        }
        console.log(typeof(input.students));
        input.students.forEach(function(student){
          schema.Student.findOne({_id: student}).exec().then(function(result){
            if(result != null){
              pushStudentJob(result.onyen, jobId).then(function(result){}).catch(function(err){
                res.render("../views/error.ejs", {string: "Student not found"});
              });
            }
            else{
              res.render("../views/error.ejs", {string: "Student not found"});
            }
          });
        });
        console.log("ABC");
        res.redirect("/job/assign/"+jobId);
      }
      else{
        res.render("../views/error.ejs", {string: "Job not found"});
      }
    });
  }
  else{
    res.render("../views/error.ejs", {string: "Required parameter not found"});
  }
}

jobController.unAssign = function(req, res){
  var input = req.body;
  if(input.studentId != null && input.jobId != null){
    schema.Student.update({_id:input.studentId}, {$pull:{jobHistory: input.jobId}}).exec().then(function(result){
      res.redirect("/job/assign/"+input.jobId);
    }).catch(function(err){
      res.render("../views/error.ejs", {string:"Student was not found."});
    });
  }
  else{
    res.render("../views/error.ejs", {string:"Either student Id or job id is missing."});
  }
}

function getFaculty(){
  return new Promise((resolve, reject)=>{
    schema.Faculty.find().sort({onyen:1}).exec().then(function(result){
      resolve(result);
    });
  });
}

function getCourses(){
  return new Promise((resolve, reject)=>{
    schema.Course.find().populate("semester").populate("faculty").sort({name:1}).exec().then(function(result){
      resolve(result);
    });
  });
}

function getSemesters(){
  return new Promise((resolve, reject)=>{
    schema.Semester.find().sort({year:1, season:1}).exec().then(function(result){
      resolve(result);
    });
  });
}


module.exports = jobController;
