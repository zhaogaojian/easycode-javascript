import { ipcMain, app } from 'electron'
import fs from 'fs'
import mysql from 'mysql2'
import ejs from 'ejs'

function queryAllTables(connection, db) {
  return new Promise((resolve, reject) => {
    const json = {}
    if (connection) {
      connection.query(`use ${db}`, err => {
        if (err) {
          json.code = -1
          json.msg = '查询数据库失败: ' + err.message
          reject(json)
        } else {
          connection.query('show tables', (err, res) => {
            if (err) {
              json.code = -1
              json.msg = '查询数据库失败: ' + err.message
              reject(json)
            } else {
              json.code = 200
              json.data = res.map(v => v[`Tables_in_${db}`])
              resolve(json)
            }
          })
        }
      })
    } else {
      json.code = -1
      json.msg = '请链接数据库再做此操作'
      reject(json)
    }
  })
}

export default function (win, renderer) {
  let connection
  ipcMain.on('queryTemplateFile', () => {
    const path = app.getPath('userData') + '\\template'
    fs.access(path, err => {
      if (err) {
        // 创建文件夹再返回空数据
        fs.mkdir(path, err => {
          const json = {}
          if (err) {
            json.code = -1
            json.msg = '创建文件夹失败'
          } else {
            json.code = 200
            json.data = []
          }
          renderer.send('queryTemplateFile', json)
        })
      } else {
        fs.readdir(path, (err, filelist) => {
          if (err) {
            renderer.send('queryTemplateFile', {
              code: -1,
              msg: '读取文件失败!'
            })
          } else {
            renderer.send('queryTemplateFile', {
              code: 200,
              data: filelist.map(v => ({
                title: v,
                value: path + '\\' + v
              }))
            })
          }
        })
      }
    })
  })

  ipcMain.on('connectToTheDatabase', (e, data) => {
    connection = mysql.createConnection(data)
    if (connection) {
      win.webContents.send('connection.success')
    } else {
      win.webContents.send('connection.failed')
    }
  })

  ipcMain.on('showDatabase', () => {
    const json = {}
    if (connection) {
      connection.query('show databases', (err, res) => {
        if (err) {
          json.code = -1
          json.msg = '查询数据库失败: ' + err.message
        } else {
          json.code = 200
          json.data = res.map(v => v.Database).filter(v => ['information schema', 'performance schema', 'mysql'].indexOf(v) === -1)
        }
        renderer.send('showDatabase', json)
      })
    } else {
      json.code = -1
      json.msg = '请链接数据库再做此操作'
      renderer.send('showDatabase', json)
    }
  })

  ipcMain.on('queryAllTables', async (e, db) => {
    try {
      const data = await queryAllTables(connection, db)
      renderer.send('queryAllTables', data)
    } catch (err) {
      renderer.send('queryAllTables', err)
    }
  })

  function gennerateEjsFile(data, tableName) {
    const newTableName = data.tableName ? data.tableName.toLocaleUpperCase() : tableName
    const newData = {
      ...data,
      table: newTableName,
      date: new Date().toLocaleDateString(),
      className: 'Test'
    }
    ejs.renderFile(data.templateName, newData, (err, str) => {
      if (err) {
        renderer.send('generateEntityFiles', {
          code: -1,
          msg: 'err: ' + err.message
        })
      } else {
        const fileName = app.getPath('userData') + '\\files\\' + newTableName + '.java'
        fs.writeFile(fileName, str, { flag: 'a' }, (err, datas) => {
          if (err) {
            renderer.send('generateEntityFiles', {
              code: -1,
              msg: 'err: ' + err.message
            })
          } else {
            renderer.send('generateEntityFiles', {
              code: 200,
              data: fileName
            })
          }
        })
      }
    })
  }

  // 生成实体类文件
  ipcMain.on('generateEntityFiles', (e, data) => {
    if (data.tableName) {
      gennerateEjsFile(data)
    } else {
      queryAllTables(connection, data.database).then(res => {
        if (res.code === 200) {
          res.data.forEach(v => {
            gennerateEjsFile(data, v.toLocaleUpperCase())
          })
        }
      })
    }
  })
}