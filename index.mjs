import express from "express";
import { createServer, request } from "http";
import { Server } from "socket.io";
import cors from "cors"
import puppeteer from "puppeteer"
import path from "path"
import e from "cors";
const PORT = process.env.PORT || 3001;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const app = express();
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  )
  next()
})
const server = createServer(app);

const io = new Server(server)

const socket_app = io.of("/get")
socket_app.on("connection", (socket) => {
  socket.emit("message", 101, new Date().toISOString(), "socket connected")
  console.log("Client connected")
  socket.on("disconnect", () => {
    console.log("Client disconnected")
  })
  socket.on("learningtasks", async (username, password, year = null) => {
    socket.emit("message", 102, new Date().toISOString(), `${username}: request recieved`)
    let years = {"2013": "1", "2014": "2", "2015": "3", "2016": "4", "2017": "5", "2018": "6", "2019": "7", "2020": "12", "2021": "11", "2022": "14", "2023": "15", "2024": "16", "2025": "17"}
    let id = 0
    year = year !== null ? years[year] : null
    console.log(year)
    let doneYet = false
    let loginFailed = false
    let foundLogin = false
    let requestNumber = 0;
    let response = {};
    socket.emit("message", 102, new Date().toISOString(), `${username}: starting puppeteer`)
    const browser = await puppeteer.launch({headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"]})
    socket.emit("message", 102, new Date().toISOString(), `${username}: opening new page`)
    const page = await browser.newPage()
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
            req.abort();
        } else if (req.url().includes("https://lilydaleheights-vic.compass.education/Services/LearningTasks.svc/GetAllLearningTasksByUserId")) {
            let body = req.postData()
            body = JSON.parse(body)
            body.limit = 500;
            body.academicGroupId = year !== null ? year : body.academicGroupId
            delete body.forceTaskId
            body = JSON.stringify(body)
            req.continue({postData: body});
        } else {
            req.continue();
        }
    });
    page.on("requestfinished", async (request) => {
      if (request.url().includes("https://lilydaleheights-vic.compass.education/login.aspx")) {
        if (requestNumber !== 1) {
          requestNumber++
          return
        }
        if (request.response().status() >= 300 && request.response().status() <= 399) {
          socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login successful`)
          loginFailed = false
          foundLogin = true
        } else {
          loginFailed = true
          foundLogin = true
        }
      } else if (request.url().includes("https://lilydaleheights-vic.compass.education/Services/LearningTasks.svc/GetAllLearningTasksByUserId")) {
        let responsebody = await request.response().json();
        responsebody = responsebody.d.data;
        for (let i = 0; i < responsebody.length; i++) {
            let task = responsebody[i];
            let uuid = task.id
            let name = task.name;
            let subject_name = task.subjectName;
            let subject_code = task.activityName;
            let attachments = [];
            let submissions = [];
            let description = task.description !== "" ? task.description : null;
            let due_date = task.dueDateTimestamp;
            let submission_status;
            let submission_svg_link;
            let year = task.createdTimestamp.split("-")[0];
            switch (task.students[0].submissionStatus) {
              case 1:
                submission_status = "pending";
                submission_svg_link = "https://cdn.jsdelivr.net/gh/clompass/clompass@main/public/svg/task-status/pending.svg";
                break;
              case 2: 
                submission_status = "Overdue";
                submission_svg_link = "https://cdn.jsdelivr.net/gh/clompass/clompass@main/public/svg/task-status/overdue.svg";
                break;
              case 3:
                submission_status = "On time";
                submission_svg_link = "https://cdn.jsdelivr.net/gh/clompass/clompass@main/public/svg/task-status/ontime.svg"
                break;
              case 4:
                submission_status = "Recieved late";
                submission_svg_link = "https://cdn.jsdelivr.net/gh/clompass/clompass@main/public/svg/task-status/receivedlate.svg";
                break;
              default:
                submission_status = null
                submission_svg_link = null
                break;
            }
            if (task.attachments != null) {
                for (let j = 0; j < task.attachments.length; j++) {
                    attachments.push({name: task.attachments[j].name, link: "https://lilydaleheights-vic.compass.education/Services/FileAssets.svc/DownloadFile?id=" + task.attachments[j].id + "&originalFileName=" + task.attachments[j].fileName.replace(/ /g, "%20"),});
                }
              } else {
                attachments = null;
              }
            if (task.students[0].submissions != null) {
              for (let j = 0; j < task.students[0].submissions.length; j++) {
                    submissions.push({name: task.students[0].submissions[j].fileName, link: "https://lilydaleheights-vic.compass.education/Services/FileDownload/FileRequestHandler?FileDownloadType=2&taskId=" + task.students[0].taskId + "&submissionId=" + task.students[0].submissions[j].id});
              }
            } else {
              submissions = null
            }
            response[task.id] = {name: name, subject_name: subject_name, subject_code: subject_code, attachments: attachments, description: description, due_date: due_date, submission_status: submission_status, submissions: submissions, submission_svg_link: submission_svg_link, id: id, uuid: uuid, year: year};
            id++; 
          }
        doneYet = true;
      }   
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to compass site`)
    await page.goto("https://lilydaleheights-vic.compass.education");
    await page.waitForSelector("#username");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting username`)
    await page.$eval("#username", (el, username) => {
        el.value = username
    }, username)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting password`)
    await page.$eval("#password", (el, password) => {
        el.value = password
    }, password)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Clicking login button`)
    await page.$eval("#button1", el => {
        el.disabled = false;
        el.click()
    })
    while (foundLogin === false) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for login response`)
      await sleep(250)
    }
    if (loginFailed === true) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login failed`)
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing puppeteer`)
      await browser.close()
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
      socket.emit("error", 401, new Date.toISOString(), "it no worke", "login failed")
      return
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for compass homepage to load`)
    await page.waitForSelector("#c_bar")
    socket.emit("message", 102, new Date().toISOString(),`${username.toUpperCase()}: Navigating to learning tasks page`)
    await page.goto("https://lilydaleheights-vic.compass.education/Records/User.aspx#learningTasks")
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for response to be processed`)
    while (doneYet !== true) {
      await sleep(100)
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing puppeteer`)
    await browser.close();
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
    socket.emit("data", 200, new Date().toISOString(),"pog it worker", "learning_tasks", response)
    return
  })
  socket.on("schedule", async (username, password) => {
    let requestNumber = 0
    let loginFailed = false
    let foundLogin = false
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Starting puppeteer`)
    const browser = await puppeteer.launch({headless: true, "args" : ["--no-sandbox", "--disable-setuid-sandbox"]})
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Opening new page`)
    let page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", req => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
        req.abort();
      }
      else {
        req.continue()
      }
    })
    page.on("requestfinished", async (request) => {
      if (request.url().includes("https://lilydaleheights-vic.compass.education/login.aspx")) {
        if (requestNumber !== 1) {
          requestNumber++
          return
        }
        if (request.response().status() >= 300 && request.response().status() <= 399) {
          socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login successful`)
          loginFailed = false
          foundLogin = true
        } else {
          loginFailed = true
          foundLogin = true
        }
      }
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to compass site`)
    await page.goto("https://lilydaleheights-vic.compass.education");
    await page.waitForSelector("#username");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting username`)
    await page.$eval("#username", (el, username) => {
        el.value = username
    }, username)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting password`)
    await page.$eval("#password", (el, password) => {
        el.value = password
    }, password)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Clicking login button`)
    await page.$eval("#button1", el => {
        el.disabled = false;
        el.click()
    })
    while (foundLogin === false) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for login response`)
      await sleep(250)
    }
    if (loginFailed === true) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login failed`)
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: closing puppeteer`)
      await browser.close()
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
      socket.emit("error", 401, new Date().toISOString(), "it no worke", "login failed")
      return
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for compass homepage to load`)
    await page.waitForSelector("#c_bar")
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to schedule page`)
    await page.goto("https://lilydaleheights-vic.compass.education/Communicate/ManageCalendars.aspx")
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for schedule page to load`)
    await page.waitForSelector("#ctl00_cpS_lnkResetCalendarKey");
    if (await page.$("#ctl00_cpS_lnkEnableSharedCalendar") !== null) {
      await page.click("#ctl00_cpS_lnkEnableSharedCalendar")
      await page.waitForSelector("#ctl00_cpM_lblPrivate")
    }
    const response = await page.evaluate(async () => {
      let el = document.querySelector("#ctl00_cpM_lblPrivate")
      let response = ""
      response = el.innerText
      return response
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing puppeteer`)
    await browser.close();
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
    socket.emit("data", 200, new Date().toISOString(), "pog it worker", "schedule_url", response)
    return
  })
  socket.on("subjects", async (username, password) => {
    let i = 0
    let requestNumber = 0
    let loginFailed = false
    let foundLogin = false;
    const response = {};
    let doneYet = {};
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Starting puppeteer`)
    const browser = await puppeteer.launch({headless: true, "args" : ["--no-sandbox", "--disable-setuid-sandbox"]})
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Opening new page`)
    let page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.resourceType() == 'stylesheet' || request.resourceType() == 'font' || request.resourceType() == 'image'){
        request.abort();
      } else {
        request.continue()
      }
    })
    page.on("requestfinished", async (request) => {
      if (request.url().includes("https://lilydaleheights-vic.compass.education/login.aspx")) {
        if (requestNumber !== 1) {
          requestNumber++
          return
        }
        if (request.response().status() >= 300 && request.response().status() <= 399) {
          socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login successful`)
          loginFailed = false
          foundLogin = true
        } else {
          loginFailed = true
          foundLogin = true
        }
      } else if (request.response().url() === "https://lilydaleheights-vic.compass.education/Services/Activity.svc/GetLessonsByActivityId?sessionstate=readonly") { 
        socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Found response`)
        const res = await request.response().json()
        const responsebody = res.d
        let key = 0
        let subject = {
          school_id: "",
          name: "",
          year: "",
          id: "",
          activity_id: "",
          lessons: {},
          teacher: "",
          teacher_code :"",
          teacher_image_url: "",
          attendee_ids: [],
        }
        subject.year = responsebody.AcademicYearLevel // year the subject took place in (2022)
        subject.name = responsebody.SubjectName // name of subject
        subject.school_id = responsebody.ActivityDisplayName // school code (7ENGA)
        subject.activity_id = responsebody.ActivityId // identifiable id 
        subject.id = responsebody.SubjectId // useless id but might mean something idk
        subject.teacher = responsebody.Instances[0].ManagerTextReadable
        subject.teacher_code = responsebody.Instances[0].m
        subject.teacher_image_url = "https://lilydaleheights-vic.compass.education" + responsebody.Instances[0].ManagerPhotoPath
        let instances = responsebody.Instances
        for (let j = 0; j<instances.length; j++) {
          let lesson = {
            key,
            uuid: "",
            location: "",
            teacher: "",
            teacher_code: "",
            teacher_image_url: "",
            display_time: "",
            start: "",
            finish: "",
            plan: {
              id: "",
              node_id: "",
              url: ""
            }
          }
          lesson.uuid = instances[j].id
          lesson.location = instances[j].l
          lesson.teacher = instances[j].ManagerTextReadable
          lesson.teacher_code = instances[j].m
          lesson.teacher_image_url = "https://lilydaleheights-vic.compass.education" + instances[j].ManagerPhotoPath
          lesson.display_time = instances[j].dt
          lesson.start = new Date(instances[j].st).getTime()
          lesson.end = new Date(instances[j].fn).getTime()
          if (instances[j].lp.fileAssetId !== null) {
            lesson.plan.id = instances[j].lp.fileAssetId
            lesson.plan.node_id = instances[j].lp.wnid
            lesson.plan.url = `https://lilydaleheights-vic.compass.education/Services/FileAssets.svc/DownloadFile?sessionstate=readonly&id=${instances[j].lp.fileAssetId}&nodeId=${instances[j].lp.wnid}`
          } else {
            lesson.plan = null
          }
          subject.lessons[lesson.uuid] = lesson
          key++
        }
        response[subject.school_id] = subject
        doneYet[i] = true;
        }
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to compass page`)
    await page.goto("https://lilydaleheights-vic.compass.education");
    await page.waitForSelector("#username");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting username`)
    await page.$eval("#username", (el, username) => {
        el.value = username
    }, username)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Inputting password`)
    await page.$eval("#password", (el, password) => {
        el.value = password
    }, password)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Clicking login button`)
    await page.$eval("#button1", el => {
        el.disabled = false;
        el.click()
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for login response`)
    while (foundLogin === false) {
      await sleep(250)
    }
    if (loginFailed === true) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login failed`)
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing Puppeteer`)
      await browser.close()
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
      socket.emit("error", 401, new Date().toISOString(), "it no worke", "login failed")
      return
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for compass homepage to load`)
    await page.waitForSelector("#c_bar");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: sorting through subjects`);
    const elements = await page.$$("#mnu_left > li:nth-child(4) > ul > li");
    const as = await page.evaluate(() => {
      let as = [];
      let element = document.querySelectorAll("#mnu_left > li:nth-child(4) > ul > li");
      for (let i = 0; i<element.length; i++) {
        if (element[i].innerHTML.includes("- ")) {
          as.push(element[i].querySelector("a").href);
        };
      };
      return as;

    });
    for (i; i<as.length; i++) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to subject ${i+1}`)
      await page.goto(as[i]);
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Waiting for response`)
      while (!doneYet[i]) {
        await sleep(250);
      };
    };
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing browser`)
    await browser.close()
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
    socket.emit("data", 200, new Date().toISOString(), "pog it worker", "subjects", response)
    return
  })
  socket.on("studentinfo", async (username, password) => {
    let requestNumber = 0
    let loginFailed = false
    let foundLogin = false
    let response = {};
    let id = 0;
    let doneYet1 = false
    let doneYet2 = false
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Student info request recieved`)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Starting Puppeteer`)
    const browser = await puppeteer.launch({headless: true, "args" : ["--no-sandbox", "--disable-setuid-sandbox"]})
    socket.emit("message", new Date().toISOString(), `${username.toUpperCase()}: Opening new page`)
    let page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
        req.abort();
      } else if (req.url().includes("https://lilydaleheights-vic.compass.education/Services/ChronicleV2.svc/GetUserChronicleFeed")) {
        let postData = req.postData()
        postData = JSON.parse(postData)
        postData.startDate = "1969-12-31T23:00:00.000Z"
        postData.pageSize =  100;
        postData = JSON.stringify(postData)
        req.continue({postData: postData})
      } else {
        req.continue()
      }
    });
    page.on("requestfinished", async (request) => {
      if (request.url().includes("https://lilydaleheights-vic.compass.education/login.aspx")) {
        if (requestNumber !== 1) {
          requestNumber++
          return
        }
        if (request.response().status() >= 300 && request.response().status() <= 399) {
          socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login successful`)
          loginFailed = false
          foundLogin = true
        } else {
          loginFailed = true
          foundLogin = true
        }
      } else if (request.url().includes("https://lilydaleheights-vic.compass.education/Services/User.svc/GetUserDetailsBlobByUserId")) {
          let responsebody = await request.response().json();
          responsebody = responsebody.d;
          response.name = responsebody.userFullName
          response.house = responsebody.userHouse
          response.form = responsebody.userFormGroup
          response.prefered_name = responsebody.userPreferredName
          response.school_id = responsebody.userSussiID
          response.image = "https://lilydaleheights-vic.compass.education/" + responsebody.userPhotoPath
          doneYet1 = true
      } else if (request.url().includes("https://lilydaleheights-vic.compass.education/Services/ChronicleV2.svc/GetUserChronicleFeed")) {
        let responsebody = await request.response().json();
        responsebody = responsebody.d.data;
        let list = {}
        for (let i=0;i<responsebody.length;i++) {
          let data = responsebody[i].chronicleEntries[0];
          let school_id = data.id
          let createdTimestamp = data.createdTimestamp;
          let occurredTimestamp = data.occurredTimestamp;
          let name = data.templateName
          let chronicles = [];
          for (let j=0; j<data.inputFields.length; j++) {
            let field_name = data.inputFields[j].name
            let description = data.inputFields[j].description
            let value = []
            let values;
            if (data.inputFields[j].value.includes("[{")) {
              values = JSON.parse(data.inputFields[j].value)
            } else {
              values = data.inputFields[j].value
            }
  
            if (values instanceof Array) {
              for (let k=0; k<values.length; k++) {
                let o = {}
                o.type = "option"
                o.name = values[k].valueOption
                o.checked = values[k].isChecked
                value.push(o)
              }
            } else {
              let o = {}
              o.type = "text"
              o.text = values
              value.push(o)
            }
            chronicles.push({name: field_name, description: description, values: value})
          }
          list[school_id] = {id: id, createdTimestamp: createdTimestamp, occurredTimestamp: occurredTimestamp, name: name, data: chronicles, school_id: school_id}
          id++
        }
        response.chronicles = list
        doneYet2 = true
      }
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: navigating to compass site`)
    await page.goto("https://lilydaleheights-vic.compass.education");
    await page.waitForSelector("#username");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: inputting username`)
    await page.$eval("#username", (el, username) => {
        el.value = username
    }, username)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: inputting password`)
    await page.$eval("#password", (el, password) => {
        el.value = password
    }, password)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: clicking login button`)
    await page.$eval("#button1", el => {
        el.disabled = false;
        el.click()
    })
    while (foundLogin === false) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for login response`)
      await sleep(250)
    }
    if (loginFailed === true) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: login failed`)
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing browser`)
      await browser.close()
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
      socket.emit("data", 401, new Date().toISOString(), "it no worke", "login failed")
      return
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for compass homepage to load`)
    await page.waitForSelector("#c_bar")
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: navigating to student info page`)
    await page.goto("https://lilydaleheights-vic.compass.education/Records/User.aspx")
    socket.emit("message", 102, new Date().toISOString(),  `${username.toUpperCase()}: waiting for response`)
    await page.waitForResponse((res) => {
      return res.url().includes("https://lilydaleheights-vic.compass.education/Services/User.svc/GetUserDetailsBlobByUserId") && res.status() === 200
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: found response`)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for info to be processed`)
    while (doneYet1 !== true || doneYet2 !== true) {
      await sleep(100)
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: closing browser`)
    await browser.close()
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: sending response`)
    socket.emit("data", 200, new Date().toISOString(), "pog it worker", "student_info", response)
  })
  socket.on("lessonplans", (lessons) => {

  })
  socket.on("getcalender", async (username, password, year, month) => {
    let day = 1;
    let date = new Date(year, month-1, day)
    let start_date = date.toLocaleDateString().split('/')
    start_date = `${start_date[2]}-${start_date[0]}-${start_date[1]}`
    let end_date = addDays(date, 34)
    end_date = end_date.toLocaleDateString().split("/")
    end_date = `${end_date[2]}-${end_date[0]}-${end_date[1]}`
    function addDays(date, days) {
      var result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    }
    console.log(`${username.toUpperCase()}: Start date: ${start_date}, End date: ${end_date}`)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Start date: ${start_date}, End date: ${end_date}`)
    let requestNumber = 0
    let loginFailed = false
    let foundLogin = false
    let response = {};
    let id = 0;
    let doneyet = false
    
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Student info request recieved`)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Starting Puppeteer`)
    const browser = await puppeteer.launch({headless: true, "args" : ["--no-sandbox", "--disable-setuid-sandbox"]})
    socket.emit("message", new Date().toISOString(), `${username.toUpperCase()}: Opening new page`)
    let page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
        req.abort();
      } else if (req.url().includes("https://lilydaleheights-vic.compass.education/Services/Calendar.svc/GetCalendarEventsByUser")) {
        let postData = req.postData()
        postData = JSON.parse(postData)
        if (postData.homePage === false) {
          postData.startDate = start_date
          postData.endDate = end_date;
        }
        postData = JSON.stringify(postData)
        req.continue({postData: postData})
      } else {
        req.continue()
      }
    });
    page.on("requestfinished", async (req) => {
      if (req.url().includes("https://lilydaleheights-vic.compass.education/login.aspx")) {
        if (requestNumber !== 1) {
          requestNumber++
          return
        }
        if (req.response().status() >= 300 && req.response().status() <= 399) {
          socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Login successful`)
          loginFailed = false
          foundLogin = true
        } else {
          loginFailed = true
          foundLogin = true
        }
      } else if (req.url().includes("https://lilydaleheights-vic.compass.education/Services/Calendar.svc/GetCalendarEventsByUser")) {
        if (JSON.parse(req.postData()).homePage === false) {
          let res = await req.response().json()
          let data = res.d
          for (var i = 0; i < data.length; i++) {
            let d = data[i]
            if (d.activityId !== 0 && d.activityType === 1) {
              let instanceId = d.instanceId;
              let title = d.longTitleWithoutTime;
              let new_title;
              let room;
              let teacher;
              let subject;
              let classChanged;
              if (title.includes("1 - ") || title.includes("2 - ") || title.includes("3 - ") || title.includes("4 - ")) {
                if (title.includes("<strike>")) {
                  classChanged = 1
                } else {
                  classChanged = 0
                }
                title = title.split(" - ")
                subject = title[1]
                if (title[2].includes("&nbsp;")) {
                  room = title[2].split("&nbsp; ")[1]
                } else {
                  room = title[2]
                }
                if (title[3].includes("&nbsp;")) {
                  teacher = title[3].split("&nbsp; ")[1]
                } else {
                  teacher = title[3]
                }
              }
              response[instanceId] = {
                startDate: new Date(d.start).valueOf(),
                endDate: new Date(d.finish).valueOf(),
                formattedStart: new Date(d.start).toLocaleTimeString("us-en", { hour: 'numeric', minute: 'numeric', hour12: true }),
                formattedEnd: new Date(d.finish).toLocaleTimeString("us-en", { hour: 'numeric', minute: 'numeric', hour12: true }),
                classChanged: classChanged,
                subject: subject,
                teacher: teacher, 
                room: room,
                text: new_title,
                uid: instanceId,
              }
            }

          }
          doneyet = true
        }
      }
    })
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: navigating to compass site`)
    await page.goto("https://lilydaleheights-vic.compass.education");
    await page.waitForSelector("#username");
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: inputting username`)
    await page.$eval("#username", (el, username) => {
        el.value = username
    }, username)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: inputting password`)
    await page.$eval("#password", (el, password) => {
        el.value = password
    }, password)
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: clicking login button`)
    await page.$eval("#button1", el => {
        el.disabled = false;
        el.click()
    })
    while (foundLogin === false) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for login response`)
      await sleep(250)
    }
    if (loginFailed === true) {
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: login failed`)
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Closing browser`)
      await browser.close()
      socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
      socket.emit("data", 401, new Date().toISOString(), "it no worke", "login failed")
      return
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: waiting for compass homepage to load`)
    await page.waitForSelector("#c_bar")
    await page.goto("https://lilydaleheights-vic.compass.education/Organise/Calendar/")
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Navigating to calender page`)
    while (doneyet === false) {
      await sleep(100)
    }
    socket.emit("message", 102, new Date().toISOString(), `${username.toUpperCase()}: Sending response`)
    await browser.close()
    socket.emit("data", 200, new Date().toISOString(), "pog it worker", "schedule_data", response )
    return

  })
})
app.get('*', (req, res) => {
    res.status(400).send("nah chief this ain't it")
    return
  });
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});